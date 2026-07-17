import { ProviderFactory } from './providers/provider.factory';
import { logger } from '../../config/logger';
import { Message } from '../../models/Message';
import { User } from '../../models/User';
import { Document } from '../../models/Document';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';
import https from 'https';
import http from 'http';
import { uploadToCloudinary } from '../../config/multer';

export interface AiResponse {
  content: string;
  type: 'text' | 'image';
  fileUrl?: string;
  fileName?: string;
}

function downloadFileToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return downloadFileToBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        return reject(new Error(`HTTP status code ${res.statusCode}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    // 10-second timeout: context image is optional, never block the AI reply for it
    req.setTimeout(10_000, () => {
      req.destroy();
      reject(new Error('Context image download timed out after 10s'));
    });
    req.on('error', reject);
  });
}

const SYSTEM_INSTRUCTION = `You are NovaMind AI — a helpful, friendly, and intelligent AI assistant.

Key behaviors:
- Respond naturally and conversationally like a knowledgeable friend.
- Give clear, well-structured, and helpful answers.
- Use markdown formatting.
- If the user sends a voice or audio attachment, it is a voice recording of them speaking. Listen to it, transcribe what they said, and answer their question. In your response, ALWAYS start with a transcription indicator line: "**[Transcribed Voice]:** '*your transcription of the user's spoken words*'\n\n" followed by your normal answer.
- If the user asks you to generate, create, draw, or show an image (e.g., "draw a cute puppy", "generate an image of a sunset"), you MUST respond ONLY with a JSON object in this exact format:
{
  "action": "generate_image",
  "prompt": "<extremely detailed, descriptive English prompt optimized for state-of-the-art FLUX/Imagen diffusion models. Describe the subject, background, layout, cinematic lighting, 3D elements, premium color palette, typography style, and request crystal clear text rendering and professional digital art masterpiece quality>"
}
Do not include any other text if you are generating an image.`;

export const aiService = {
  /**
   * Generates an AI response using conversation history for context.
   */
  generateChatResponse: async (
    conversationId: string, 
    userMessage: string,
    options?: { model?: string; temperature?: number; maxTokens?: number }
  ): Promise<AiResponse> => {
    const botUserId = env.GEMINI_BOT_ID
      ? env.GEMINI_BOT_ID
      : (await User.findOne({ email: 'novamind-ai@novamind.ai' }))?._id?.toString();

    // Load last 40 messages for conversation context
    const allMessages = await Message.find({ conversationId })
      .sort({ createdAt: 'asc' })
      .limit(40);

    // Exclude the last saved message (the current user msg) from history
    const historyMessages = allMessages.slice(0, -1);

    // Build unified history
    const rawHistory = historyMessages
      .filter((msg) => msg.content && msg.content.trim() !== '')
      .map((msg) => ({
        role: botUserId && msg.senderId.toString() === botUserId ? ('model' as const) : ('user' as const),
        content: msg.content,
      }));

    // Prepend system instruction to the first message if no history yet
    const messageToSend = rawHistory.length === 0
      ? `${SYSTEM_INSTRUCTION}\n\n${userMessage}`
      : userMessage;

    // Check recent history (last 5 messages) for an image attachment
    let imageAttachment: { mimeType: string; data: string } | undefined;
    const recentMessages = allMessages.slice(-5);
    const imageMessage = [...recentMessages].reverse().find(m => m.type === 'image' && m.fileUrl);

    if (imageMessage && imageMessage.fileUrl) {
      try {
        logger.info(`Downloading image for prompt: ${imageMessage.fileUrl}`);
        const imageBuffer = await downloadFileToBuffer(imageMessage.fileUrl);
        
        let mimeType = 'image/jpeg';
        if (imageMessage.fileUrl.endsWith('.png')) mimeType = 'image/png';
        else if (imageMessage.fileUrl.endsWith('.webp')) mimeType = 'image/webp';
        else if (imageMessage.fileUrl.endsWith('.gif')) mimeType = 'image/gif';

        imageAttachment = {
          mimeType,
          data: imageBuffer.toString('base64'),
        };
      } catch (err: any) {
        logger.error(`Failed to download image for AI prompt: ${err.message}`);
      }
    }

    // Check recent history (last 5 messages) for an audio/voice attachment
    let audioAttachment: { mimeType: string; data: string } | undefined;
    const audioMessage = [...recentMessages].reverse().find(m => 
      m.fileUrl && (
        m.fileUrl.endsWith('.webm') || 
        m.fileUrl.endsWith('.wav') || 
        m.fileUrl.endsWith('.mp3') || 
        m.fileUrl.endsWith('.m4a') || 
        m.fileName?.toLowerCase().includes('voice') ||
        m.fileName?.toLowerCase().endsWith('.webm') ||
        m.fileName?.toLowerCase().endsWith('.wav')
      )
    );

    if (audioMessage && audioMessage.fileUrl) {
      try {
        logger.info(`Downloading audio message: ${audioMessage.fileUrl}`);
        const audioBuffer = await downloadFileToBuffer(audioMessage.fileUrl);
        
        let mimeType = 'audio/webm';
        if (audioMessage.fileUrl.endsWith('.wav') || audioMessage.fileName?.toLowerCase().endsWith('.wav')) mimeType = 'audio/wav';
        else if (audioMessage.fileUrl.endsWith('.mp3') || audioMessage.fileName?.toLowerCase().endsWith('.mp3')) mimeType = 'audio/mp3';
        else if (audioMessage.fileUrl.endsWith('.m4a') || audioMessage.fileName?.toLowerCase().endsWith('.m4a')) mimeType = 'audio/m4a';

        audioAttachment = {
          mimeType,
          data: audioBuffer.toString('base64'),
        };
      } catch (err: any) {
        logger.error(`Failed to download audio for AI prompt: ${err.message}`);
      }
    }

    try {
      const modelName = options?.model || 'gemini-3.1-flash-lite';
      const provider = ProviderFactory.getProvider(modelName);
      
      logger.info(`Routing request to AI Provider: ${provider.name} (Model: ${modelName})`);
      
      const textResponse = await provider.generateResponse(messageToSend, {
        history: rawHistory,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        model: modelName,
        imageAttachment,
        audioAttachment,
      });


      // Check if response is an image generation JSON payload
      const trimmed = textResponse.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          const isGenerateAction = parsed.action === 'generate_image' || parsed.action === 'dalle.text2im';

          if (isGenerateAction) {
            let promptText = '';

            if (parsed.prompt) {
              promptText = parsed.prompt;
            } else if (parsed.action_input) {
              if (typeof parsed.action_input === 'string') {
                try {
                  const subParsed = JSON.parse(parsed.action_input);
                  promptText = subParsed.prompt || parsed.action_input;
                } catch {
                  promptText = parsed.action_input;
                }
              } else if (typeof parsed.action_input === 'object') {
                promptText = parsed.action_input.prompt || '';
              }
            }

            if (promptText) {
              logger.info(`AI requested image generation for prompt: ${promptText}`);

              // Generate image using the provider's generateImage method (which automatically selects the best AI)
              let imageBuffer: Buffer;
              if (provider.generateImage) {
                imageBuffer = await provider.generateImage(promptText);
              } else {
                // Fallback to GeminiProvider direct instantiation if provider doesn't implement generateImage
                const geminiProvider = ProviderFactory.getProvider('gemini-3.1-flash-lite');
                imageBuffer = await geminiProvider.generateImage!(promptText);
              }

              // Upload generated image to Cloudinary
              const cloudResult = await uploadToCloudinary(imageBuffer, 'generated_image.png', 'novamind/ai_generated');

              // Save to Document collection for the user
              const lastMsg = allMessages[allMessages.length - 1];
              if (lastMsg && lastMsg.senderId) {
                try {
                  await Document.create({
                    userId: lastMsg.senderId,
                    conversationId,
                    fileName: cloudResult.public_id.split('/').pop() || 'generated_image.png',
                    originalName: `Generated: ${promptText.substring(0, 30)}.png`,
                    fileType: 'image/png',
                    fileSize: imageBuffer.length,
                    storagePath: cloudResult.secure_url,
                    cloudinaryPublicId: cloudResult.public_id,
                    status: 'Ready',
                  });
                } catch (docErr: any) {
                  logger.error(`Failed to save generated image to Document schema: ${docErr.message}`);
                }
              }

              return {
                content: promptText,
                type: 'image',
                fileUrl: cloudResult.secure_url,
                fileName: 'generated_image.png',
              };
            }
          }
        } catch (e: any) {
          logger.error(`Failed to parse AI JSON or generate image: ${e.message}`);
        }
      }

      return {
        content: textResponse,
        type: 'text',
      };
    } catch (error: any) {
      logger.error(`AI model invocation failed: ${error.message}`);
      throw error;
    }
  },

  /**
   * Ensure the AI Bot user exists in the database.
   */
  ensureBotUser: async (): Promise<string> => {
    const botId = env.GEMINI_BOT_ID;

    if (botId) {
      const existingBot = await User.findById(botId);
      if (existingBot) return botId;
    }

    let botUser = await User.findOne({ email: 'novamind-ai@novamind.ai' });
    if (!botUser) {
      botUser = await User.create({
        name: 'NovaMind AI',
        email: 'novamind-ai@novamind.ai',
        password: 'bot-account-no-login-' + Date.now(),
        avatarUrl: '',
        role: 'admin',
        status: 'online',
      });
      logger.info(`AI Bot user created with ID: ${botUser._id}`);
    }

    return botUser._id.toString();
  },

  /**
   * Generates a smart short title for a new conversation.
   */
  generateTitle: async (firstMessage: string, modelName?: string): Promise<string> => {
    try {
      const model = modelName || 'gemini-3.1-flash-lite';
      const provider = ProviderFactory.getProvider(model);
      return await provider.generateTitle(firstMessage);
    } catch (err: any) {
      logger.error(`Title generation failed: ${err.message}`);
      return firstMessage.substring(0, 25);
    }
  },

  /**
   * Transcribes audio using Gemini's native audio understanding.
   */
  transcribeAudio: async (audioUrl: string): Promise<string> => {
    try {
      logger.info(`Transcribing audio attachment: ${audioUrl}`);
      const audioBuffer = await downloadFileToBuffer(audioUrl);
      
      let mimeType = 'audio/webm';
      if (audioUrl.endsWith('.wav')) mimeType = 'audio/wav';
      else if (audioUrl.endsWith('.mp3')) mimeType = 'audio/mp3';
      else if (audioUrl.endsWith('.m4a')) mimeType = 'audio/m4a';

      const audioAttachment = {
        mimeType,
        data: audioBuffer.toString('base64'),
      };

      const prompt = `Listen to the attached audio and transcribe it. Return only the transcription, nothing else.`;

      const provider = ProviderFactory.getProvider('gemini-3.1-flash-lite');
      const transcription = await provider.generateResponse(prompt, {
        audioAttachment,
      });

      logger.info(`Transcription result: "${transcription.trim()}"`);
      return transcription.trim();
    } catch (err: any) {
      logger.error(`Audio transcription failed: ${err.message}`);
      return 'Voice Message';
    }
  },
};