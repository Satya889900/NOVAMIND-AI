import { Embedding } from '../../models/Embedding';
import { embeddingService } from '../documents/embedding.service';

export const retrieverService = {
  retrieveRelevantChunks: async (query: string, documentId: string, limit = 3) => {
    // 1. Generate query vector
    const queryVector = await embeddingService.generateEmbedding(query);

    // 2. Fetch all document chunks (in standard ChromaDB/vector search, we do vector distance comparison.
    // Here we'll retrieve chunks associated with the document from Mongo DB as database fallback.)
    const chunks = await Embedding.find({ documentId }).limit(limit);

    return chunks.map((chunk) => ({
      content: chunk.content,
      score: 1.0, // mock score since it's database fallback
    }));
  },
};
