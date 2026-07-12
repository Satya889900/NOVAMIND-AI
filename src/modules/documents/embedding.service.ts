import { embeddingModel } from '../../config/gemini';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/ApiError';

export const embeddingService = {
  generateEmbedding: async (text: string): Promise<number[]> => {
    if (!embeddingModel) {
      logger.warn('Gemini embedding model not initialized, using mock vector fallback');
      const mockVector: number[] = Array.from({ length: 768 }, () => Math.random());
      return mockVector;
    }

    try {
      const res = await embeddingModel.embedContent(text);
      const embedding = res.embedding;
      return embedding.values;
    } catch (error: any) {
      logger.error(`Failed to create embedding: ${error.message}`);
      throw new ApiError(500, 'Failed to create embedding.');
    }
  },
};
