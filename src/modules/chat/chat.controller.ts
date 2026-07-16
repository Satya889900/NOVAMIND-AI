import { Request, Response } from 'express';
import { chatService } from './chat.service';
import { aiService } from '../ai/ai.service';
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

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const messages = await chatService.getMessagesByRoom(req.params.roomId);
  return sendSuccess(res, 'Messages list retrieved successfully', messages);
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
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

  try {
    const botUserId = await aiService.ensureBotUser();
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
        const answer = await ragService.answerQuestion(content, conversation.documentId.toString());
        aiResponse = {
          content: answer,
          type: 'text' as const,
        };
      } else if (modelName.toLowerCase().includes('flux')) {
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
            fileName: cloudResult.public_id.split('/').pop() || 'flux_generated_image.png',
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
          fileName: 'flux_generated_image.png',
        };
      } else {
        // Generate AI response using current model settings
        aiResponse = await aiService.generateChatResponse(roomId, content, {
          model: modelName,
          temperature,
          maxTokens,
        });
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
  }

  // 4. Return both the user's message and the AI reply
  const responseData: any = {
    userMessage,
    ...(aiReply ? { aiReply } : {}),
  };

  return sendSuccess(res, 'Message sent successfully', responseData, 201);
});

export const uploadChatAttachment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.parsedFile) {
    throw new ApiError(400, 'No file uploaded');
  }

  const { filename, mimetype, buffer, size } = req.parsedFile;

  // 1. Upload to Cloudinary (using 'auto' to auto-detect images/files)
  const cloudResult = await uploadToCloudinary(buffer, filename, 'novamind/chat');

  // 2. Also save in the Document collection so it shows up in the Documents page
  try {
    await Document.create({
      userId: req.user.id,
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
