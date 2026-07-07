import { env } from './env';
import { logger } from './logger';

export const chromaConfig = {
  url: env.CHROMADB_URL,
};

export const initializeChroma = async (): Promise<boolean> => {
  try {
    // ChromaDB initialization log
    logger.info(`ChromaDB Connection Url: ${chromaConfig.url}`);
    return true;
  } catch (error: any) {
    logger.error(`Error connecting to ChromaDB: ${error.message}`);
    return false;
  }
};
