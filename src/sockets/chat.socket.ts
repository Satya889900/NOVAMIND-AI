import { Server, Socket } from 'socket.io';
import { logger } from '../config/logger';

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
   * NOTE: 'send_message' from the frontend is just a real-time notification
   * to other users in the room. The actual message SAVING and AI REPLY
   * is handled by the REST API (POST /api/v1/chats/:roomId/messages).
   * 
   * The frontend calls BOTH:
   *   1. socket.emit('send_message', ...) — broadcasts to other users instantly
   *   2. POST /api/v1/chats/:roomId/messages — saves to DB + gets AI reply
   * 
   * So this socket handler does NOT save to DB or call AI — just re-broadcasts.
   */
  socket.on('send_message', (data: { roomId: string; content: string; type?: string }) => {
    const { roomId, content, type } = data;

    if (!content || !content.trim()) {
      logger.warn(`Empty socket message ignored from user ${userId}`);
      return;
    }

    // Broadcast to OTHER users in the room (not back to sender)
    socket.to(roomId).emit('message_received', {
      _id: `temp-${Date.now()}`,
      conversationId: roomId,
      roomId,
      senderId: {
        _id: userId,
        id: userId,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl || '',
        status: 'online',
      },
      content,
      type: type || 'text',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
};
