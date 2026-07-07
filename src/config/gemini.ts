import { GoogleGenAI } from '@google/genai';
import { env } from './env';
import { logger } from './logger';

let aiClient: GoogleGenAI | null = null;

if (env.GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    logger.info('Google GenAI Client initialized successfully');
  } catch (error: any) {
    logger.error(`Error initializing Gemini AI: ${error.message}`);
  }
} else {
  logger.warn('GEMINI_API_KEY environment variable is not defined');
}

export { aiClient };
