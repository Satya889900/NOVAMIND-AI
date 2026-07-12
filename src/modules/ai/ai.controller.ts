import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/response';
import { chatService } from '../chat/chat.service';
import { aiService } from './ai.service';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';

export const handleAiChat = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId, message: userMessage } = req.body;
  const userId = req.user.id;

  if (!env.GEMINI_BOT_ID) {
    throw new ApiError(500, 'GEMINI_BOT_ID is not configured.');
  }

  // 1. Save the user's message
  await chatService.createMessage(conversationId, userId, userMessage, 'text');

  // 2. Generate AI response (loads history inside)
  const aiResponseContent = await aiService.generateChatResponse(conversationId, userMessage);

  // 3. Save the AI's message
  const aiMessage = await chatService.createMessage(
    conversationId,
    env.GEMINI_BOT_ID,
    aiResponseContent,
    'text'
  );

  // 4. Return the AI's response to the frontend
  return sendSuccess(
    res,
    'AI response generated successfully',
    {
      conversationId,
      message: {
        // Assuming your Message model populates senderId and you can derive the role
        // For simplicity, we are hardcoding it as per the spec.
        role: 'assistant',
        content: aiMessage.content,
      },
    },
    201
  );
});