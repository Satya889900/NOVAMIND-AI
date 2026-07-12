import { Server, Socket } from 'socket.io';
import { logger } from '../config/logger';
import { chatService } from '../modules/chat/chat.service';
import { aiService } from '../modules/ai/ai.service';
import { env } from '../config/env';

export const handleChatSocket = (io: Server, socket: Socket) => {
  const user = (socket as any).user as any;
  const userId = user._id.toString();

  socket.on('join_room', (roomId: string) => {
    socket.join(roomId);
    logger.info(`User ${userId} joined room ${roomId}`);
  });

  socket.on('leave_room', (roomId: string) => {
    socket.leave(roomId);
    logger.info(`User ${userId} left room ${roomId}`);
  });

  socket.on('typing', (data: { roomId: string; isTyping: boolean }) => {
    socket.to(data.roomId).emit('user_typing', {
      roomId: data.roomId,
      userId: user._id,
      userName: user.name,
      isTyping: data.isTyping,
    });
  });

  /**
   * Handle incoming messages and auto-reply with AI
   */
  socket.on('send_message', async (data: { roomId: string; message: string }) => {
    try {
      const { roomId, message: content } = data;

      // 1. Save user message
      const userMessage = await chatService.createMessage(
        roomId,
        userId,
        content,
        'text'
      );

      // Emit user message to all in room
      io.to(roomId).emit('new_message', {
        roomId,
        message: userMessage,
      });

      // 2. Generate AI response if GEMINI_BOT_ID is configured
      if (env.GEMINI_BOT_ID) {
        try {
          const aiResponse = await aiService.generateChatResponse(roomId, content);

          // 3. Save AI message
          const aiMessage = await chatService.createMessage(
            roomId,
            env.GEMINI_BOT_ID,
            aiResponse,
            'text'
          );

          // Emit AI response to all in room
          io.to(roomId).emit('new_message', {
            roomId,
            message: aiMessage,
          });

          logger.info(`Auto-reply sent in room ${roomId}`);
        } catch (aiError: any) {
          logger.error(`Error generating AI response: ${aiError.message}`);
          // Emit error event but don't crash
          socket.emit('ai_error', {
            roomId,
            error: 'Failed to generate AI response',
          });
        }
      }
    } catch (error: any) {
      logger.error(`Socket message error: ${error.message}`);
      socket.emit('message_error', {
        error: error.message || 'Failed to send message',
      });
    }
  });
};
