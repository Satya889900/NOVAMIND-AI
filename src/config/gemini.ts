import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from './env';
import { logger } from './logger';

// Models tried in order — if one fails (503/429/404), next one is used automatically
const MODEL_FALLBACK_ORDER = [
  'gemini-3.1-flash-lite',
  'gemma-4-26b-a4b-it',
  'gemini-3.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-flash-latest',
];

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

const geminiModel = aiClient?.getGenerativeModel({ model: MODEL_FALLBACK_ORDER[0] });
const embeddingModel = aiClient?.getGenerativeModel({ model: 'gemini-embedding-001' });

export { aiClient, geminiModel, embeddingModel, MODEL_FALLBACK_ORDER };
