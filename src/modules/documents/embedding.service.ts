import { aiClient } from '../../config/gemini';
import { logger } from '../../config/logger';

export const embeddingService = {
  generateEmbedding: async (text: string): Promise<number[]> => {
    if (aiClient) {
      try {
        const res: any = await aiClient.models.embedContent({
          model: 'text-embedding-004',
          contents: text,
        });
        if (res.embedding?.values) {
          return res.embedding.values;
        }
      } catch (error: any) {
        logger.error(`Error generating Gemini embedding: ${error.message}`);
      }
    }

    // Fallback Mock vector (384-dimensional or 1536-dimensional float array)
    logger.warn('Gemini embedding failed or API key not present, using mock vector fallback');
    const mockVector: number[] = Array.from({ length: 768 }, () => Math.random());
    return mockVector;
  },
};
