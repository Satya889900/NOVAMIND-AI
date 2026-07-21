import { Request, Response } from 'express';
import { chatService } from './chat.service';
import { aiService, downloadFileToBuffer } from '../ai/ai.service';
import { ProviderFactory } from '../ai/providers/provider.factory';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { Document } from '../../models/Document';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/ApiError';
import { uploadToCloudinary } from '../../config/multer';
import { Settings } from '../../models/Settings';
import { ragService } from '../rag/rag.service';
import { aiQueueService } from '../../services/aiQueue.service';

const isImageModelName = (model: string) => {
  const m = model.toLowerCase();
  return m.includes('flux') || m.includes('pollinations-image') || m.endsWith('-image') || m.includes('blackforest');
};

const isMultimodalModel = (model?: string) => {
  if (!model || model.trim() === '') return true; // Default system model is Gemini Flash (Multimodal)
  const m = model.toLowerCase();
  return m.includes('gemini') || m.includes('google');
};

const isTextQueryForImageModel = (prompt: string) => {
  const p = prompt.trim().toLowerCase();
  if (/^(hi|hello|hey|greetings|hola|test|ping|who are you|what is|how do|how to|explain|write|code|tell me|translate|summarize|calculate)\b/i.test(p)) {
    if (!/image|picture|photo|painting|drawing|illustration|sketch|render|portrait|wallpaper/i.test(p)) {
      return true;
    }
  }
  return false;
};

const isImagePromptForTextModel = (prompt: string) => {
  const p = prompt.trim().toLowerCase();
  return /\b(image|img|pic|picture|photo|photos|drawing|illustration|sketch|portrait|wallpaper)\b/i.test(p) ||
         /^\s*(generate|create|draw|paint|make|render)\b/i.test(p);
};

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const messages = await chatService.getMessagesByRoom(req.params.roomId);
  return sendSuccess(res, 'Messages list retrieved successfully', messages);
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  logger.info(`[debug] sendMessage req.body: ${JSON.stringify(req.body)}`);
  const { content, type, fileUrl, fileName, model: requestedModel } = req.body;
  const roomId = req.params.roomId;
  const userId = req.user.id;

  // Check if this is the FIRST message in the conversation (for title generation)
  const existingMessageCount = await Message.countDocuments({ conversationId: roomId });
  const isFirstMessage = existingMessageCount === 0;

  // 1. Save the user's message
  const userMessage = await chatService.createMessage(
    roomId,
    userId,
    content,
    type,
    fileUrl,
    fileName
  );

  // Fetch or create user settings
  let userSettings = await Settings.findOne({ userId });
  if (!userSettings) {
    userSettings = await Settings.create({
      userId,
      theme: 'system',
      notificationsEnabled: true,
      systemInstructions: 'You are NovaMind AI, a helpful AI assistant.',
      defaultModel: 'gemini-3.1-flash-lite',
      temperature: 0.8,
      maxTokens: 2048,
    });
  }

  // Use the per-message model override if provided, otherwise fall back to default
  const modelName = requestedModel || userSettings.defaultModel;
  const temperature = userSettings.temperature;
  const maxTokens = userSettings.maxTokens;

  // 2. If it's the first message, generate a smart title using AI (fire-and-forget)
  if (isFirstMessage) {
    aiService.generateTitle(content, modelName).then(async (title) => {
      const conv = await Conversation.findById(roomId);
      if (conv && (!conv.name || conv.name === 'New Chat')) {
        await chatService.renameConversation(roomId, title);
        logger.info(`AI-generated title for conversation ${roomId}: "${title}"`);
      }
    }).catch((err) => {
      logger.error(`Title generation failed: ${err.message}`);
    });
  }

  // 3. Auto-generate AI reply (always, for all messages)
  let aiReply = null;
  let botUserId = '';

  try {
    botUserId = await aiService.ensureBotUser();
    const conversation = await Conversation.findById(roomId).lean();

    if (conversation) {
      // Auto-add the AI bot to the conversation if not already there
      const botIsParticipant = (conversation.participants as any[]).some(
        (p: any) => p.toString() === botUserId
      );
      if (!botIsParticipant) {
        await Conversation.findByIdAndUpdate(roomId, {
          $addToSet: { participants: botUserId },
        });
      }

      let aiResponse;
      if (conversation.documentId) {
        logger.info(`Conversation ${roomId} has documentId ${conversation.documentId}. Invoking RAG flow.`);
        
        let queryText = content;
        const isAudioFile = fileUrl && (
          fileUrl.endsWith('.webm') || 
          fileUrl.endsWith('.wav') || 
          fileUrl.endsWith('.mp3') || 
          fileUrl.endsWith('.m4a') || 
          fileName?.toLowerCase().includes('voice') ||
          fileName?.toLowerCase().endsWith('.webm') ||
          fileName?.toLowerCase().endsWith('.wav')
        );

        if (isAudioFile) {
          logger.info(`Voice message detected in RAG room. Transcribing audio before query execution.`);
          const transcription = await aiService.transcribeAudio(fileUrl);
          queryText = transcription;
          
          // Update the user's message content in the database so the transcript is persistent in the chat UI
          userMessage.content = `🎤 [Voice Message]: "${transcription}"`;
          await userMessage.save();
        }

        const answer = await ragService.answerQuestion(queryText, conversation.documentId.toString());
        
        const finalAnswer = isAudioFile
          ? `**[Transcribed Voice]:** *"${queryText}"*\n\n${answer}`
          : answer;

        aiResponse = {
          content: finalAnswer,
          type: 'text' as const,
        };
      } else if (isImageModelName(modelName)) {
        if (isTextQueryForImageModel(content)) {
          aiResponse = {
            content: `🎨 **Image Model Notice**: You are currently using **${modelName}**, which is an **Image Generation Model** designed for visual descriptions (e.g., *"A futuristic cyberpunk city at sunset"*).\n\nTo ask questions, write text, or chat, please select a **Text Generation Model** (such as Gemini or Llama 3.3) from the model selector.`,
            type: 'text' as const,
          };
        } else {
          const provider = ProviderFactory.getProvider(modelName);
          logger.info(`Directly generating image via ${provider.name} provider for prompt: "${content}"`);
          const imageBuffer = await provider.generateImage!(content);
          
          // Upload to Cloudinary
          const cloudResult = await uploadToCloudinary(imageBuffer, 'generated_image.png', 'novamind/ai_generated');
          
          // Also save in the Document collection so it shows up in the Documents page
          try {
            await Document.create({
              userId: userId,
              conversationId: roomId,
              fileName: cloudResult.public_id.split('/').pop() || 'generated_image.png',
              originalName: `Generated: ${content.substring(0, 30)}.png`,
              fileType: 'image/png',
              fileSize: imageBuffer.length,
              storagePath: cloudResult.secure_url,
              cloudinaryPublicId: cloudResult.public_id,
              status: 'Ready',
            });
          } catch (docErr: any) {
            logger.error(`Failed to save generated image to Document schema: ${docErr.message}`);
          }

          aiResponse = {
            content: `Here is your generated image for prompt: "${content}"`,
            type: 'image' as const,
            fileUrl: cloudResult.secure_url,
            fileName: 'generated_image.png',
          };
        }
      } else {
        if (isImagePromptForTextModel(content)) {
          if (!isMultimodalModel(modelName)) {
            aiResponse = {
              content: `⚠️ **Text Model Notice**: You are currently using **${modelName}**, which is a **Text Generation Model**.\n\nTo generate images, please select an **Image Generation Model** (such as **FLUX.1 Schnell** or **Pollinations FLUX Image**) from the model selector menu.`,
              type: 'text' as const,
            };
          } else {
            const provider = ProviderFactory.getProvider(modelName);
            logger.info(`Directly generating image via Gemini provider for prompt: "${content}"`);
            const imageBuffer = await provider.generateImage!(content);
            const cloudResult = await uploadToCloudinary(imageBuffer, 'generated_image.png', 'novamind/ai_generated');

            try {
              await Document.create({
                userId: userId,
                conversationId: roomId,
                fileName: cloudResult.public_id.split('/').pop() || 'generated_image.png',
                originalName: `Generated: ${content.substring(0, 30)}.png`,
                fileType: 'image/png',
                fileSize: imageBuffer.length,
                storagePath: cloudResult.secure_url,
                cloudinaryPublicId: cloudResult.public_id,
                status: 'Ready',
              });
            } catch (docErr: any) {
              logger.error(`Failed to save generated image to Document schema: ${docErr.message}`);
            }

            aiResponse = {
              content: `Here is your generated image for prompt: "${content}"`,
              type: 'image' as const,
              fileUrl: cloudResult.secure_url,
              fileName: 'generated_image.png',
            };
          }
        } else {
          // Generate AI response using current model settings
          aiResponse = await aiService.generateChatResponse(roomId, content, {
            model: modelName,
            temperature,
            maxTokens,
          });
        }
      }

      // Save the AI response as a message from the bot
      aiReply = await chatService.createMessage(
        roomId,
        botUserId,
        aiResponse.content,
        aiResponse.type,
        aiResponse.fileUrl,
        aiResponse.fileName,
        modelName
      );

      logger.info(`AI auto-replied in conversation ${roomId} using model ${modelName}`);
    }
  } catch (error: any) {
    logger.error(`AI auto-reply failed: ${error.message}`);
    // Don't fail the entire request — user's message is already saved
    // Create a message from the bot detailing the error so the user has immediate feedback!
    try {
      if (!botUserId) {
        botUserId = await aiService.ensureBotUser();
      }
      let friendlyError = `An error occurred while generating the AI response: ${error.message}`;
      const errMsg = error.message.toLowerCase();
      
      if (
        errMsg.includes('insufficient balance') || 
        errMsg.includes('insufficient_funds') || 
        errMsg.includes('insufficient_quota') || 
        errMsg.includes('balance') || 
        errMsg.includes('credit') ||
        errMsg.includes('402') ||
        errMsg.includes('429') ||
        errMsg.includes('payment') ||
        errMsg.includes('billing') ||
        errMsg.includes('quota') ||
        errMsg.includes('plan expired') ||
        errMsg.includes('expired')
      ) {
        friendlyError = `⚠️ **AI API Billing Alert: Plan Expired / Quota Exceeded**\n\nYour API account has run out of credits or exceeded its usage quota. Please check your billing details or top up your balance at the model provider's developer console to continue using this model.`;
      } else if (errMsg.includes('model_not_found') || errMsg.includes('model does not exist') || errMsg.includes('404')) {
        friendlyError = `⚠️ **AI API Error: Model Not Found (HTTP 404)**\n\nThe selected model ID does not exist or you do not have access to it. Please select a different model or check your provider account permissions.`;
      } else if (errMsg.includes('401') || errMsg.includes('unauthorized') || errMsg.includes('api_key') || errMsg.includes('invalid_api_key') || errMsg.includes('authentication error')) {
        friendlyError = `⚠️ **AI API Error: Unauthorized / Invalid API Key (HTTP 401)**\n\nPlease check that your API keys are correctly configured in the backend environment.`;
      }
      
      aiReply = await chatService.createMessage(
        roomId,
        botUserId,
        friendlyError,
        'text',
        undefined,
        undefined,
        modelName
      );
    } catch (msgErr: any) {
      logger.error(`Failed to create error reply message: ${msgErr.message}`);
    }
  }

  // 4. Return both the user's message and the AI reply
  const responseData: any = {
    userMessage,
    ...(aiReply ? { aiReply } : {}),
  };

  return sendSuccess(res, 'Message sent successfully', responseData, 201);
});

export const uploadChatAttachment = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id || req.user?._id;

  if (!userId) {
    throw new ApiError(401, 'User not authenticated');
  }

  if (!req.parsedFile) {
    throw new ApiError(400, 'No file uploaded');
  }

  const { filename, mimetype, buffer, size } = req.parsedFile;

  // 1. Upload to Cloudinary (using 'auto' to auto-detect images/files)
  const cloudResult = await uploadToCloudinary(buffer, filename, 'novamind/chat');

  // 2. Also save in the Document collection so it shows up in the Documents page
  try {
    await Document.create({
      userId,
      fileName: cloudResult.public_id.split('/').pop() || filename,
      originalName: filename,
      fileType: mimetype,
      fileSize: size,
      storagePath: cloudResult.secure_url,
      cloudinaryPublicId: cloudResult.public_id,
      status: 'Ready',
    });
  } catch (docErr: any) {
    logger.error(`Failed to save uploaded attachment to Document schema: ${docErr.message}`);
  }

  // 3. Return URL and public ID
  return sendSuccess(res, 'File uploaded successfully', {
    url: cloudResult.secure_url,
    publicId: cloudResult.public_id,
    fileName: filename,
    fileType: mimetype,
    fileSize: size,
  });
});

export const streamMessage = asyncHandler(async (req: Request, res: Response) => {
  logger.info(`[debug] streamMessage req.body: ${JSON.stringify(req.body)}`);
  const { content, type, fileUrl, fileName, model: requestedModel } = req.body;
  const roomId = req.params.roomId;
  const userId = req.user?.id || req.user?._id;
  if (!userId) {
    throw new ApiError(401, 'User not authenticated');
  }

  // 1. Set up SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'none'); // bypass compression middleware buffering

  // 2. Save user message to database
  const userMessage = await chatService.createMessage(
    roomId,
    userId,
    content,
    type,
    fileUrl,
    fileName
  );



  // Fetch or create user settings
  let userSettings = await Settings.findOne({ userId });
  if (!userSettings) {
    userSettings = await Settings.create({
      userId,
      theme: 'system',
      notificationsEnabled: true,
      systemInstructions: 'You are NovaMind AI, a helpful AI assistant.',
      defaultModel: 'gemini-3.1-flash-lite',
      temperature: 0.8,
      maxTokens: 2048,
    });
  }

  const modelName = requestedModel || userSettings.defaultModel;
  const temperature = userSettings.temperature;
  const maxTokens = userSettings.maxTokens;

  // Title generation for first message
  const existingMessageCount = await Message.countDocuments({ conversationId: roomId });
  if (existingMessageCount === 1) { // userMessage is the first one
    aiService.generateTitle(content, modelName).then(async (title) => {
      const conv = await Conversation.findById(roomId);
      if (conv && (!conv.name || conv.name === 'New Chat')) {
        await chatService.renameConversation(roomId, title);
        logger.info(`AI-generated title for conversation ${roomId}: "${title}"`);
        const io = req.app.get('io');
        if (io) {
          io.to(roomId).emit('room_renamed', { roomId, name: title });
        }
      }
    }).catch((err) => {
      logger.error(`Title generation failed: ${err.message}`);
    });
  }

  let botUserId = '';
  try {
    await aiQueueService.enqueueTask(roomId, async () => {
      botUserId = await aiService.ensureBotUser();
      const conversation = await Conversation.findById(roomId).lean();

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Auto-add bot participant
      const botIsParticipant = (conversation.participants as any[]).some(
        (p: any) => p.toString() === botUserId
      );
      if (!botIsParticipant) {
        await Conversation.findByIdAndUpdate(roomId, {
          $addToSet: { participants: botUserId },
        });
      }

      // Handle streaming based on model type
    if (conversation.documentId) {
      // Document QA/RAG (doesn't stream tokens natively, return complete block)
      res.write(`data: ${JSON.stringify({ token: "🔍 Searching document and generating answer...\n\n" })}\n\n`);
      const answer = await ragService.answerQuestion(content, conversation.documentId.toString());
      res.write(`data: ${JSON.stringify({ token: answer })}\n\n`);
      
      const aiReply = await chatService.createMessage(
        roomId,
        botUserId,
        answer,
        'text',
        undefined,
        undefined,
        modelName
      );



      res.write(`data: ${JSON.stringify({ done: true, message: aiReply, userMessage })}\n\n`);
      res.end();
      return;
    } else if (isImageModelName(modelName)) {
      if (isTextQueryForImageModel(content)) {
        const textNotice = `🎨 **Image Model Notice**: You are currently using **${modelName}**, which is an **Image Generation Model** designed for visual descriptions (e.g., *"A futuristic cyberpunk city at sunset"*).\n\nTo ask questions, write text, or chat, please select a **Text Generation Model** (such as Gemini or Llama 3.3) from the model selector.`;
        res.write(`data: ${JSON.stringify({ token: textNotice })}\n\n`);

        const aiReply = await chatService.createMessage(
          roomId,
          botUserId,
          textNotice,
          'text',
          undefined,
          undefined,
          modelName
        );

        res.write(`data: ${JSON.stringify({ done: true, message: aiReply, userMessage })}\n\n`);
        res.end();
        return;
      }

      // FLUX / Pollinations Image Gen
      res.write(`data: ${JSON.stringify({ token: "🎨 Generating image..." })}\n\n`);
      
      const provider = ProviderFactory.getProvider(modelName);
      const imageBuffer = await provider.generateImage!(content);
      const cloudResult = await uploadToCloudinary(imageBuffer, 'generated_image.png', 'novamind/ai_generated');

      try {
        await Document.create({
          userId: userId,
          conversationId: roomId,
          fileName: cloudResult.public_id.split('/').pop() || 'generated_image.png',
          originalName: `Generated: ${content.substring(0, 30)}.png`,
          fileType: 'image/png',
          fileSize: imageBuffer.length,
          storagePath: cloudResult.secure_url,
          cloudinaryPublicId: cloudResult.public_id,
          status: 'Ready',
        });
      } catch (docErr: any) {
        logger.error(`Failed to save generated image to Document schema: ${docErr.message}`);
      }

      const textResponse = `Here is your generated image for prompt: "${content}"`;
      
      const aiReply = await chatService.createMessage(
        roomId,
        botUserId,
        textResponse,
        'image',
        cloudResult.secure_url,
        'generated_image.png',
        modelName
      );

      res.write(`data: ${JSON.stringify({ done: true, message: aiReply, userMessage })}\n\n`);
      res.end();
      return;
    } else {
      if (isImagePromptForTextModel(content)) {
        if (!isMultimodalModel(modelName)) {
          const textNotice = `⚠️ **Text Model Notice**: You are currently using **${modelName}**, which is a **Text Generation Model**.\n\nTo generate images, please select an **Image Generation Model** (such as **FLUX.1 Schnell** or **Pollinations FLUX Image**) from the model selector menu.`;
          res.write(`data: ${JSON.stringify({ token: textNotice })}\n\n`);

          const aiReply = await chatService.createMessage(
            roomId,
            botUserId,
            textNotice,
            'text',
            undefined,
            undefined,
            modelName
          );

          res.write(`data: ${JSON.stringify({ done: true, message: aiReply, userMessage })}\n\n`);
          res.end();
          return;
        } else {
          // Gemini Multimodal Model receiving an image prompt:
          // Directly trigger image generation via provider.generateImage!
          res.write(`data: ${JSON.stringify({ token: "🎨 Generating image using Gemini..." })}\n\n`);
          
          const provider = ProviderFactory.getProvider(modelName);
          const imageBuffer = await provider.generateImage!(content);
          const cloudResult = await uploadToCloudinary(imageBuffer, 'generated_image.png', 'novamind/ai_generated');

          try {
            await Document.create({
              userId: userId,
              conversationId: roomId,
              fileName: cloudResult.public_id.split('/').pop() || 'generated_image.png',
              originalName: `Generated: ${content.substring(0, 30)}.png`,
              fileType: 'image/png',
              fileSize: imageBuffer.length,
              storagePath: cloudResult.secure_url,
              cloudinaryPublicId: cloudResult.public_id,
              status: 'Ready',
            });
          } catch (docErr: any) {
            logger.error(`Failed to save generated image to Document schema: ${docErr.message}`);
          }

          const textResponse = `Here is your generated image for prompt: "${content}"`;
          
          const aiReply = await chatService.createMessage(
            roomId,
            botUserId,
            textResponse,
            'image',
            cloudResult.secure_url,
            'generated_image.png',
            modelName
          );

          res.write(`data: ${JSON.stringify({ done: true, message: aiReply, userMessage })}\n\n`);
          res.end();
          return;
        }
      }

      // Standard Text AI Model Streaming
      const provider = ProviderFactory.getProvider(modelName);
      if (!provider.streamResponse) {
        // Fallback for providers that don't implement native streaming
        const fullContent = await provider.generateResponse(content, {
          model: modelName,
          temperature,
          maxTokens,
        });

        res.write(`data: ${JSON.stringify({ token: fullContent })}\n\n`);

        const aiReply = await chatService.createMessage(
          roomId,
          botUserId,
          fullContent,
          'text',
          undefined,
          undefined,
          modelName
        );

        res.write(`data: ${JSON.stringify({ done: true, message: aiReply, userMessage })}\n\n`);
        res.end();
        return;
      }

      // Load recent message history from DB for conversation context
      const dbHistory = await Message.find({ conversationId: roomId })
        .sort({ createdAt: 1 })
        .limit(30)
        .lean();

      // Convert history format
      const providerHistory = dbHistory.map(msg => ({
        role: msg.senderId.toString() === botUserId ? 'assistant' as const : 'user' as const,
        content: msg.content,
      }));

      // Exclude last user message just saved
      if (providerHistory.length > 0) {
        providerHistory.pop();
      }

      let imageAttachment: any = undefined;
      if (type === 'image' && fileUrl) {
        try {
          const buffer = await downloadFileToBuffer(fileUrl);
          imageAttachment = {
            mimeType: 'image/png',
            data: buffer.toString('base64'),
          };
        } catch (e: any) {
          logger.warn(`Failed to fetch image attachment for stream: ${e.message}`);
        }
      }

      const stream = provider.streamResponse(content, {
        model: modelName,
        temperature,
        maxTokens,
        history: providerHistory,
        imageAttachment,
      });

      let fullContent = '';
      for await (const chunk of stream) {
        fullContent += chunk;
        res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
      }

      const trimmedFull = fullContent.trim();
      const isJsonImageAction =
        trimmedFull.startsWith('{') && trimmedFull.endsWith('}') &&
        (trimmedFull.includes('"generate_image"') || trimmedFull.includes('"dalle.text2im"'));

      if (isJsonImageAction) {
        if (!isMultimodalModel(modelName)) {
          const textNotice = `⚠️ **Text Model Notice**: You are currently using **${modelName}**, which is a **Text Generation Model**.\n\nTo generate images, please select an **Image Generation Model** (such as **FLUX.1 Schnell** or **Pollinations FLUX Image**) from the model selector menu.`;
          res.write(`data: ${JSON.stringify({ token: textNotice })}\n\n`);

          const aiReply = await chatService.createMessage(
            roomId,
            botUserId,
            textNotice,
            'text',
            undefined,
            undefined,
            modelName
          );

          res.write(`data: ${JSON.stringify({ done: true, message: aiReply, userMessage })}\n\n`);
          res.end();
          return;
        }

        // Gemini Multimodal Model: Execute image generation
        try {
          const parsed = JSON.parse(trimmedFull);
          const isGenerateAction =
            parsed.action === 'generate_image' || parsed.action === 'dalle.text2im';

          if (isGenerateAction) {
            let promptText = '';
            if (parsed.prompt) {
              promptText = parsed.prompt;
            } else if (parsed.action_input) {
              if (typeof parsed.action_input === 'string') {
                try {
                  const sub = JSON.parse(parsed.action_input);
                  promptText = sub.prompt || parsed.action_input;
                } catch { promptText = parsed.action_input; }
              } else if (typeof parsed.action_input === 'object') {
                promptText = parsed.action_input.prompt || '';
              }
            }

            if (promptText) {
              logger.info(`[stream] Gemini requested image generation for prompt: ${promptText}`);

              res.write(`data: ${JSON.stringify({ token: '🎨 Generating image using Gemini Imagen...' })}\n\n`);

              const imgProvider = ProviderFactory.getProvider(modelName);
              const imageBuffer = await imgProvider.generateImage!(promptText);
              const cloudResult = await uploadToCloudinary(imageBuffer, 'generated_image.png', 'novamind/ai_generated');

              try {
                await Document.create({
                  userId,
                  conversationId: roomId,
                  fileName: cloudResult.public_id.split('/').pop() || 'generated_image.png',
                  originalName: `Generated: ${promptText.substring(0, 30)}.png`,
                  fileType: 'image/png',
                  fileSize: imageBuffer.length,
                  storagePath: cloudResult.secure_url,
                  cloudinaryPublicId: cloudResult.public_id,
                  status: 'Ready',
                });
              } catch (docErr: any) {
                logger.error(`Failed to save AI-generated image to Document: ${docErr.message}`);
              }

              const aiReply = await chatService.createMessage(
                roomId,
                botUserId,
                `Here is your generated image for prompt: "${promptText}"`,
                'image',
                cloudResult.secure_url,
                'generated_image.png',
                modelName
              );

              res.write(`data: ${JSON.stringify({ done: true, message: aiReply, userMessage })}\n\n`);
              res.end();
              return;
            }
          }
        } catch (parseErr: any) {
          logger.warn(`[stream] Failed to parse JSON image action: ${parseErr.message}`);
        }
      }

      // Save complete response to DB and finish stream
      const aiReply = await chatService.createMessage(
        roomId,
        botUserId,
        fullContent,
        'text',
        undefined,
        undefined,
        modelName
      );

      res.write(`data: ${JSON.stringify({ done: true, message: aiReply, userMessage })}\n\n`);
      res.end();
    }});
  } catch (error: any) {
    logger.error(`AI streaming auto-reply failed: ${error.message}`);
    
    let friendlyError = `An error occurred while generating the AI response: ${error.message}`;
    const errMsg = error.message.toLowerCase();
    
    if (
      errMsg.includes('insufficient balance') || 
      errMsg.includes('insufficient_funds') || 
      errMsg.includes('insufficient_quota') || 
      errMsg.includes('balance') || 
      errMsg.includes('credit') ||
      errMsg.includes('402') ||
      errMsg.includes('429') ||
      errMsg.includes('payment') ||
      errMsg.includes('billing') ||
      errMsg.includes('quota') ||
      errMsg.includes('plan expired') ||
      errMsg.includes('expired')
    ) {
      friendlyError = `⚠️ **AI API Billing Alert: Plan Expired / Quota Exceeded**\n\nYour API account has run out of credits or exceeded its usage quota. Please check your billing details or top up your balance at the model provider's developer console to continue using this model.`;
    } else if (errMsg.includes('model_not_found') || errMsg.includes('model does not exist') || errMsg.includes('404')) {
      friendlyError = `⚠️ **AI API Error: Model Not Found (HTTP 404)**\n\nThe selected model ID does not exist or you do not have access to it. Please select a different model or check your provider account permissions.`;
    } else if (errMsg.includes('401') || errMsg.includes('unauthorized') || errMsg.includes('api_key') || errMsg.includes('invalid_api_key') || errMsg.includes('authentication error')) {
      friendlyError = `⚠️ **AI API Error: Unauthorized / Invalid API Key (HTTP 401)**\n\nPlease check that your API keys are correctly configured in the backend environment.`;
    }

    try {
      if (!botUserId) {
        botUserId = await aiService.ensureBotUser();
      }
      
      const aiReply = await chatService.createMessage(
        roomId,
        botUserId,
        friendlyError,
        'text',
        undefined,
        undefined,
        modelName
      );



      res.write(`data: ${JSON.stringify({ error: friendlyError, message: aiReply })}\n\n`);
    } catch (msgErr: any) {
      logger.error(`Failed to create error reply message: ${msgErr.message}`);
    }
    res.end();
  }
});
