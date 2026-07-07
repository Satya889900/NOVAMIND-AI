import { Server, Socket } from 'socket.io';
import { logger } from '../config/logger';

export const handleChatSocket = (io: Server, socket: Socket) => {
  const userId = (socket as any).userId;

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
      userId,
      isTyping: data.isTyping,
    });
  });
};
