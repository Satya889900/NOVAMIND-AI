import { DocumentChunk } from '../../models/DocumentChunk';
import { embeddingService } from '../documents/embedding.service';
import { logger } from '../../config/logger';

export const retrieverService = {
  retrieveRelevantChunks: async (query: string, documentId: string, limit = 3) => {
    logger.info(`Retrieving relevant chunks for query: "${query}" in document: ${documentId}`);

    // 1. Try querying ChromaDB first
    try {
      const { chromaService } = require('../documents/chroma.service');
      const chromaResults = await chromaService.queryRelevantChunks(query, documentId, limit);
      if (chromaResults !== null) {
        logger.info(`Successfully retrieved ${chromaResults.length} chunks from ChromaDB`);
        return chromaResults;
      }
    } catch (chromaErr: any) {
      logger.warn(`ChromaDB query failed: ${chromaErr.message}. Falling back to MongoDB vector search.`);
    }

    // 2. Fallback: Fetch all chunks associated with the document from DocumentChunk collection

    const chunks = await DocumentChunk.find({ documentId });
    if (chunks.length === 0) {
      logger.warn(`No chunks found in database for document: ${documentId}`);
      return [];
    }

    // 2. Generate query vector
    let queryVector: number[] | null = null;
    try {
      queryVector = await embeddingService.generateEmbedding(query);
    } catch (err: any) {
      logger.warn(`Failed to generate query embedding: ${err.message}. Falling back to keyword search.`);
    }

    // 3. Compute relevance scores
    const scoredChunks = chunks.map((chunk) => {
      let score = 0.0;

      // If we have both vectors, calculate cosine similarity
      if (queryVector && chunk.vector && chunk.vector.length === queryVector.length) {
        let dotProduct = 0.0;
        let normA = 0.0;
        let normB = 0.0;
        for (let i = 0; i < queryVector.length; i++) {
          dotProduct += queryVector[i] * chunk.vector[i];
          normA += queryVector[i] * queryVector[i];
          normB += chunk.vector[i] * chunk.vector[i];
        }
        score = normA === 0 || normB === 0 ? 0.0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      } else {
        // Fallback: simple keyword matching score (overlap fraction)
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        if (queryWords.length === 0) {
          score = 0.0;
        } else {
          const contentLower = chunk.content.toLowerCase();
          const matches = queryWords.filter(word => contentLower.includes(word)).length;
          score = matches / queryWords.length;
        }
      }

      return {
        content: chunk.content,
        score,
      };
    });

    // 4. Sort by score descending and take top N
    const sorted = scoredChunks.sort((a, b) => b.score - a.score);
    const topChunks = sorted.slice(0, limit);

    logger.info(`Retrieved ${topChunks.length} chunks. Highest similarity score: ${topChunks[0]?.score?.toFixed(4) || 0}`);
    return topChunks;
  },
};
