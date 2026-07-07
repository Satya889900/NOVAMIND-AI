import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { connectDB } from './config/db';
import { initSockets } from './sockets';
import { socketConfig } from './config/socket';
import { initializeChroma } from './config/chromadb';
import { logger } from './config/logger';

const server = http.createServer(app);

// Initialize Socket.io Wrapper
const io = new Server(server, socketConfig);

// Start Up Orchestrator
async function startServer() {
  // 1. Database Connections
  await connectDB();
  await initializeChroma();

  // 2. Sockets Setup
  initSockets(io);

  // 3. Listen on Port
  const PORT = env.PORT;
  server.listen(PORT, () => {
    logger.info(`Server is running in ${env.NODE_ENV} mode on port ${PORT}`);
  });
}

// Global Exception Handlers
process.on('unhandledRejection', (err: any) => {
  logger.error(`Unhandled Rejection Error: ${err.message}`);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err: any) => {
  logger.error(`Uncaught Exception Error: ${err.message}`);
  server.close(() => process.exit(1));
});

startServer();
