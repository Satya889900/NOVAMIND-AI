import { Server } from 'socket.io';
import { handleConnection } from './connection';
import { logger } from '../config/logger';

export const initSockets = (io: Server) => {
  logger.info('Initializing Socket.io server listeners...');

  io.on('connection', (socket) => {
    handleConnection(io, socket);
  });
};
