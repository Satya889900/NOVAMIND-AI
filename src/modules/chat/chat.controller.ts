import { Request, Response } from 'express';
import { chatService } from './chat.service';
import { aiService } from '../ai/ai.service';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { Conversation } from '../../models/Conversation';
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

  // 1. Save the user's message
  const userMessage = await chatService.createMessage(
    roomId,
    userId,
    content,
    type,
    fileUrl,
    fileName
  );

  // 2. Check if this is an AI conversation (bot is a participant)
  //    If yes, auto-generate a Gemini response
  let aiReply = null;

  if (geminiModel) {
    try {
      const botUserId = await aiService.ensureBotUser();
      const conversation = await Conversation.findById(roomId).lean();

      if (conversation) {
        // Check if the AI bot is a participant in this conversation
        let botIsParticipant = conversation.participants.some(
          (p: any) => p.toString() === botUserId
        );

        // Auto-add the AI bot to the conversation if it's not already there
        // This makes it act exactly like a Gemini global chat
        if (!botIsParticipant) {
          await Conversation.findByIdAndUpdate(roomId, {
            $addToSet: { participants: botUserId }
          });
          botIsParticipant = true;
        }

        if (botIsParticipant) {
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
      }
    } catch (error: any) {
      logger.error(`AI auto-reply failed: ${error.message}`);
      // Don't fail the entire request — the user's message was already saved
    }
  }

  // 3. Return the user's message (+ AI reply if generated)
  const responseData: any = {
    userMessage,
    ...(aiReply ? { aiReply } : {}),
  };

  return sendSuccess(res, 'Message sent successfully', responseData, 201);
});
