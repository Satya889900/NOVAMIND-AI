import { Request, Response } from 'express';
import { chatService } from './chat.service';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { Conversation } from '../../models/Conversation';
import { geminiService } from '../ai/gemini.service';
import { logger } from '../../config/logger';

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const messages = await chatService.getMessagesByRoom(req.params.roomId);
  return sendSuccess(res, 'Messages list retrieved successfully', messages);
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const { content, type, fileUrl, fileName } = req.body;
  const message = await chatService.createMessage(
    req.params.roomId,
    req.user.id,
    content,
    type,
    fileUrl,
    fileName
  );

  // Broadcast the message to the socket room
  const io = req.app.get('io');
  if (io) {
    io.to(req.params.roomId).emit('message_received', message);
  }

  // Check if the Gemini AI Assistant bot is a participant in this conversation
  const GEMINI_BOT_ID = '6a4f70cea2ba595922f0714b';
  const conversation = await Conversation.findById(req.params.roomId);

  if (
    conversation &&
    conversation.participants.includes(GEMINI_BOT_ID as any) &&
    req.user.id !== GEMINI_BOT_ID
  ) {
    // Generate AI response asynchronously in the background
    (async () => {
      try {
        // Emit typing status for the AI bot
        if (io) {
          io.to(req.params.roomId).emit('user_typing', {
            roomId: req.params.roomId,
            userId: GEMINI_BOT_ID,
            userName: 'Gemini Pro',
            isTyping: true,
          });
        }

        // Simulate thinking latency (1.5 seconds)
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Generate response content from Gemini
        const aiResponse = await geminiService.generateResponse(content);

        // Save AI bot message in the database
        const botMessage = await chatService.createMessage(
          req.params.roomId,
          GEMINI_BOT_ID,
          aiResponse,
          'text'
        );

        // Turn off typing indicator and broadcast bot message
        if (io) {
          io.to(req.params.roomId).emit('user_typing', {
            roomId: req.params.roomId,
            userId: GEMINI_BOT_ID,
            userName: 'Gemini Pro',
            isTyping: false,
          });
          io.to(req.params.roomId).emit('message_received', botMessage);
        }
      } catch (err: any) {
        logger.error(`Error generating Gemini response: ${err.message}`);
      }
    })();
  }

  return sendSuccess(res, 'Message sent successfully', message, 201);
});
