import { Request, Response } from 'express';
import { chatService } from './chat.service';
import { aiService } from '../ai/ai.service';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { logger } from '../../config/logger';
import { geminiModel } from '../../config/gemini';

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const messages = await chatService.getMessagesByRoom(req.params.roomId);
  return sendSuccess(res, 'Messages list retrieved successfully', messages);
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { content, type, fileUrl, fileName } = req.body;
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

  // 2. If it's the first message, generate a smart title using AI (fire-and-forget)
  if (isFirstMessage && geminiModel) {
    aiService.generateTitle(content).then(async (title) => {
      const conv = await Conversation.findById(roomId);
      if (conv && (!conv.name || conv.name === 'New Chat')) {
        await chatService.renameConversation(roomId, title);
        logger.info(`AI-generated title for conversation ${roomId}: "${title}"`);
      }
    }).catch((err) => {
      logger.error(`Title generation failed: ${err.message}`);
    });
  }

  // 3. Auto-generate Gemini reply (always, for all messages)
  let aiReply = null;

  if (geminiModel) {
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

        // Generate AI response using Gemini
        const aiResponseText = await aiService.generateChatResponse(roomId, content);

        // Save the AI response as a message from the bot
        aiReply = await chatService.createMessage(
          roomId,
          botUserId,
          aiResponseText,
          'text'
        );

        logger.info(`AI auto-replied in conversation ${roomId}`);
      }
    } catch (error: any) {
      logger.error(`AI auto-reply failed: ${error.message}`);
      // Don't fail the entire request — user's message is already saved
    }
  }

  // 4. Return both the user's message and the AI reply
  const responseData: any = {
    userMessage,
    ...(aiReply ? { aiReply } : {}),
  };

  return sendSuccess(res, 'Message sent successfully', responseData, 201);
});
