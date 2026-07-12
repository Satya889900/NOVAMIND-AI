import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from './env';
import { logger } from './logger';

let aiClient: GoogleGenerativeAI | null = null;

if (env.GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    logger.info('Google GenAI Client initialized successfully');
  } catch (error: any) {
    logger.error(`Error initializing Gemini AI: ${error.message}`);
  }
} else {
  logger.warn('GEMINI_API_KEY environment variable is not defined. AI features will be disabled.');
}

const geminiModel = aiClient?.getGenerativeModel({ model: 'gemini-3.5-flash' });
const embeddingModel = aiClient?.getGenerativeModel({ model: 'text-embedding-004' });

export { aiClient, geminiModel, embeddingModel };
