import { Chroma } from '@langchain/community/vectorstores/chroma';
import { ChromaClient } from 'chromadb';
import { Document as LangChainDocument } from '@langchain/core/documents';
import { CustomGeminiEmbeddings } from './embedding.service';
import { logger } from '../../config/logger';

const CHROMA_URL = 'http://localhost:8000';
const COLLECTION_NAME = 'novamind_documents';

// Initialize the raw ChromaClient for collection management operations (like deletions)
const chromaClient = new ChromaClient({ path: CHROMA_URL });

// Initialize LangChain's Chroma wrapper
let vectorStore: Chroma | null = null;
try {
  vectorStore = new Chroma(new CustomGeminiEmbeddings(), {
    collectionName: COLLECTION_NAME,
    url: CHROMA_URL,
  });
  logger.info('LangChain Chroma Vector Store initialized successfully');
} catch (err: any) {
  logger.warn(`Failed to initialize LangChain Chroma: ${err.message}. RAG will fallback to MongoDB search.`);
}

export const chromaService = {
  /**
   * Check if ChromaDB is available and responding.
   */
  isAvailable: async (): Promise<boolean> => {
    try {
      await chromaClient.heartbeat();
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Store document text chunks in ChromaDB.
   */
  addDocumentChunks: async (documentId: string, chunks: string[]): Promise<boolean> => {
    try {
      if (!vectorStore || !(await chromaService.isAvailable())) {
        logger.warn(`ChromaDB server is unavailable. Skipping Chroma storage for document ${documentId}.`);
        return false;
      }

      logger.info(`Adding ${chunks.length} chunks to ChromaDB for document ${documentId}`);

      const langchainDocs = chunks.map((chunk, index) => {
        return new LangChainDocument({
          pageContent: chunk,
          metadata: {
            documentId: documentId,
            chunkIndex: index,
          },
        });
      });

      // Add documents to ChromaDB
      await vectorStore.addDocuments(langchainDocs);
      logger.info(`Successfully stored chunks in ChromaDB for document ${documentId}`);
      return true;
    } catch (err: any) {
      logger.error(`Error adding chunks to ChromaDB: ${err.message}`);
      return false;
    }
  },

  /**
   * Retrieve relevant chunks from ChromaDB for a given query, filtered by document ID.
   */
  queryRelevantChunks: async (query: string, documentId: string, limit = 3): Promise<{ content: string; score: number }[] | null> => {
    try {
      if (!vectorStore || !(await chromaService.isAvailable())) {
        logger.warn(`ChromaDB server is offline. Falling back to MongoDB vector search.`);
        return null;
      }

      logger.info(`Searching ChromaDB for query: "${query}" in document ${documentId}`);

      // Perform similarity search with metadata filter
      const results = await vectorStore.similaritySearchWithScore(query, limit, {
        documentId: documentId,
      });

      logger.info(`ChromaDB search completed. Retrieved ${results.length} relevant chunks.`);

      // LangChain returns results as [Document, score]
      // In similaritySearchWithScore, lower score often means closer distance (cosine distance/L2),
      // we map them to a uniform score format.
      return results.map(([doc, score]) => ({
        content: doc.pageContent,
        score: typeof score === 'number' ? score : 1.0,
      }));
    } catch (err: any) {
      logger.error(`Error querying ChromaDB: ${err.message}. Falling back to MongoDB.`);
      return null;
    }
  },

  /**
   * Delete all chunks associated with a document ID from ChromaDB.
   */
  deleteDocumentChunks: async (documentId: string): Promise<boolean> => {
    try {
      if (!(await chromaService.isAvailable())) {
        logger.warn(`ChromaDB is offline. Skipping chunk cleanup in Chroma for document ${documentId}.`);
        return false;
      }

      logger.info(`Cleaning up ChromaDB chunks for document ${documentId}`);
      
      const collection = await chromaClient.getOrCreateCollection({ name: COLLECTION_NAME });
      // Delete chunks by metadata filter
      await collection.delete({
        where: { documentId: documentId },
      });

      logger.info(`Successfully cleaned up ChromaDB chunks for document ${documentId}`);
      return true;
    } catch (err: any) {
      logger.error(`Error deleting chunks from ChromaDB: ${err.message}`);
      return false;
    }
  },
};
