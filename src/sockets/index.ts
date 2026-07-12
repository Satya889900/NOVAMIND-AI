import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { Conversation } from '../models/Conversation';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { handleConnection } from './connection';
 
let io: Server | null = null;
let isInitialized = false;
 
export const getIO = () => {
  if (!io || !isInitialized) throw new Error('Socket.io not initialized');
  return io;
};

export const initSockets = (ioInstance: Server) => {
  io = ioInstance;

  // Socket connection handler
  io.on('connection', (socket) => {
    handleConnection(io!, socket);
  });

  isInitialized = true;
  logger.info('Socket.io initialized successfully with auto-reply enabled');
};
