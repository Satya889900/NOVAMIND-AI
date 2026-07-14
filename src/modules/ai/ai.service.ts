import { GoogleGenerativeAI } from '@google/generative-ai';
import { aiClient, MODEL_FALLBACK_ORDER } from '../../config/gemini';
import { logger } from '../../config/logger';
import { Message } from '../../models/Message';
import { User } from '../../models/User';
import { Conversation } from '../../models/Conversation';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';
import https from 'https';
import http from 'http';

function downloadFileToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFileToBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode && res.statusCode >= 400) {
        return reject(new Error(`HTTP status code ${res.statusCode}`));
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const SYSTEM_INSTRUCTION = `You are NovaMind AI — a helpful, friendly, and intelligent AI assistant.

Key behaviors:
- Respond naturally and conversationally like a knowledgeable friend.
- Give clear, well-structured, and helpful answers.
- Use markdown formatting: bold for emphasis, bullet lists for points, numbered lists for steps, code blocks for code.
- If asked to write code, always use fenced code blocks with the language name (e.g. \`\`\`python).
- Be warm, supportive, and professional.
- If you don't know something, say so honestly.
- Keep responses focused and avoid unnecessary filler text.`;

/**
 * Try generating content with model fallback.
 * If the primary model fails with 503/429/404, try the next model in the list.
 */
async function generateWithFallback(
  prompt: string | any[],
  history: { role: string; parts: { text: string }[] }[] = []
): Promise<string> {
  if (!aiClient) throw new ApiError(503, 'AI client is not initialized. Check GEMINI_API_KEY in .env');

  const errors: string[] = [];

  for (const modelName of MODEL_FALLBACK_ORDER) {
    try {
      const model = (aiClient as GoogleGenerativeAI).getGenerativeModel({ model: modelName });

      let text: string;

      if (history.length > 0) {
        // Multi-turn chat with history
        const chat = model.startChat({
          history,
          generationConfig: { maxOutputTokens: 2048, temperature: 0.8 },
        });
        const result = await chat.sendMessage(prompt);
        text = result.response.text();
      } else {
        // Single-turn generation
        const result = await model.generateContent(prompt);
        text = result.response.text();
      }

      if (text && text.trim()) {
        if (modelName !== MODEL_FALLBACK_ORDER[0]) {
          logger.info(`AI responded using fallback model: ${modelName}`);
        }
        return text;
      }
    } catch (err: any) {
      const msg = err.message || String(err);
      errors.push(`[${modelName}]: ${msg}`);
      logger.warn(`Model ${modelName} failed: ${msg}`);

      // Only continue to fallback for retriable errors (503, 429, 404)
      const isRetriable = msg.includes('503') || msg.includes('429') || msg.includes('404') || msg.includes('not found') || msg.includes('high demand') || msg.includes('quota');
      if (!isRetriable) break;
    }
  }

  throw new Error(`All models failed:\n${errors.join('\n')}`);
}

export const aiService = {
  /**
   * Generates an AI response using conversation history for context.
   */
  generateChatResponse: async (conversationId: string, userMessage: string): Promise<string> => {
    if (!aiClient) {
      throw new ApiError(503, 'AI Service is not available. Please configure GEMINI_API_KEY in .env');
    }

    const botUserId = env.GEMINI_BOT_ID
      ? env.GEMINI_BOT_ID
      : (await User.findOne({ email: 'novamind-ai@novamind.ai' }))?._id?.toString();

    // Load last 40 messages for conversation context
    const allMessages = await Message.find({ conversationId })
      .sort({ createdAt: 'asc' })
      .limit(40);

    // CRITICAL: Exclude the last saved message (the current user msg) from history
    // since we send it separately. Prevents duplicate consecutive 'user' turns.
    const historyMessages = allMessages.slice(0, -1);

    // Build valid Gemini history with alternating roles
    const rawHistory = historyMessages
      .filter((msg) => msg.content && msg.content.trim() !== '')
      .map((msg) => ({
        role: botUserId && msg.senderId.toString() === botUserId ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    // Merge consecutive same-role turns (Gemini requires strict alternation)
    const history: { role: string; parts: { text: string }[] }[] = [];
    for (const entry of rawHistory) {
      if (history.length === 0 || history[history.length - 1].role !== entry.role) {
        history.push({ ...entry });
      } else {
        history[history.length - 1].parts[0].text += '\n' + entry.parts[0].text;
      }
    }

    // Prepend system instruction to the first message if no history yet
    const messageToSend = history.length === 0
      ? `${SYSTEM_INSTRUCTION}\n\n${userMessage}`
      : userMessage;

    // Check recent history (last 5 messages) for an image attachment
    let promptParts: any[] = [];
    const recentMessages = allMessages.slice(-5);
    const imageMessage = [...recentMessages].reverse().find(m => m.type === 'image' && m.fileUrl);

    if (imageMessage && imageMessage.fileUrl) {
      try {
        logger.info(`Downloading image for Gemini prompt: ${imageMessage.fileUrl}`);
        const imageBuffer = await downloadFileToBuffer(imageMessage.fileUrl);
        
        // Determine correct mime type
        let mimeType = 'image/jpeg';
        if (imageMessage.fileUrl.endsWith('.png')) mimeType = 'image/png';
        else if (imageMessage.fileUrl.endsWith('.webp')) mimeType = 'image/webp';
        else if (imageMessage.fileUrl.endsWith('.gif')) mimeType = 'image/gif';

        promptParts.push({
          inlineData: {
            mimeType,
            data: imageBuffer.toString('base64'),
          },
        });
      } catch (err: any) {
        logger.error(`Failed to download image for Gemini prompt: ${err.message}`);
      }
    }

    // Add the text query part
    promptParts.push({ text: messageToSend });

    try {
      const finalPrompt = promptParts.length > 1 ? promptParts : messageToSend;
      return await generateWithFallback(finalPrompt, history);
    } catch (error: any) {
      logger.error(`All AI models failed for conversation ${conversationId}: ${error.message}`);
      return `I'm sorry, the AI service is temporarily unavailable. Please try again in a moment.`;
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
  generateTitle: async (firstMessage: string): Promise<string> => {
    if (!aiClient) return firstMessage.substring(0, 25);

    try {
      const prompt = `Generate a very short chat title (3-5 words max) summarizing this message. No quotes, no punctuation at end.\n\nMessage: "${firstMessage}"\n\nTitle:`;
      const title = await generateWithFallback(prompt);
      return title.trim().replace(/^["'](.*)["']$/, '$1') || firstMessage.substring(0, 25);
    } catch {
      return firstMessage.substring(0, 25);
    }
  },
};