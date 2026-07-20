import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { corsOptions } from './config/cors';
import { apiLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/logger';
import { errorHandler } from './middleware/error';
import { ApiError } from './utils/ApiError';
import apiRouter from './routes/index';

const app = express();

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'https:', 'http:'],
        'media-src': ["'self'", 'data:', 'https:', 'http:'],
        'connect-src': ["'self'", 'https:', 'http:', 'wss:', 'ws:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS config
app.use(cors(corsOptions));

// Parsing incoming JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Custom API Loggers
app.use(requestLogger);

// Rate Limiter for API calls
app.use('/api', apiLimiter);

// API Router Gateway
app.use('/api', apiRouter);

// Fallback error handler for 404 requests
app.use((req, res, next) => {
  next(new ApiError(404, `Resource not found - ${req.originalUrl}`));
});

// Global Error Handler Middleware
app.use(errorHandler);

export default app;
