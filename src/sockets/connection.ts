import { Server, Socket } from 'socket.io';
import { handleChatSocket } from './chat.socket';
import { logger } from '../config/logger';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User } from '../models/User';

export const handleConnection = (io: Server, socket: Socket) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    logger.warn(`Rejected unauthorized socket connection: ${socket.id}`);
    socket.disconnect(true);
    return;
  }

  try {
    const decoded: any = jwt.verify(token, env.JWT_SECRET);
    (socket as any).userId = decoded.id;
    logger.info(`Socket client connected: ${socket.id} (user: ${decoded.id})`);

    // Asynchronously fetch user to attach to socket
    User.findById(decoded.id).select('name').then(user => {
      if (user) {
        (socket as any).user = user;
      }

      // Emit online status change
      io.emit('user_status_changed', { userId: decoded.id, status: 'online' });

      // Join user's individual room
      socket.join(decoded.id);

      // Register handlers
      handleChatSocket(io, socket);

      socket.on('disconnect', () => {
        logger.info(`Socket client disconnected: ${socket.id}`);
        io.emit('user_status_changed', { userId: decoded.id, status: 'offline' });
      });
    });
  } catch (error) {
    logger.error(`Socket authorization verification failed: ${socket.id}`);
    socket.disconnect(true);
  }
};
