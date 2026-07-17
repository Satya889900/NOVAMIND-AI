import { Embeddings, EmbeddingsParams } from '@langchain/core/embeddings';
import { embeddingModel } from '../../config/gemini';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/ApiError';

export class CustomGeminiEmbeddings extends Embeddings {
  constructor(params?: EmbeddingsParams) {
    super(params ?? {});
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    const embeddings = await Promise.all(
      documents.map((doc) => embeddingService.generateEmbedding(doc))
    );
    return embeddings;
  }

  async embedQuery(document: string): Promise<number[]> {
    return await embeddingService.generateEmbedding(document);
  }
}

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

