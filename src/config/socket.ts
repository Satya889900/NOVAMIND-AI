import { ServerOptions } from 'socket.io';
import { env } from './env';

export const socketConfig: Partial<ServerOptions> = {
  cors: {
    origin: env.NODE_ENV === 'development' ? '*' : false,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket'],
};
