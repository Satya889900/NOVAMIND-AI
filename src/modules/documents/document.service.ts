import { Document } from '../../models/Document';
import { Embedding } from '../../models/Embedding';
import { parserService } from './parser.service';
import { chunkService } from './chunk.service';
import { embeddingService } from './embedding.service';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../config/logger';

export const documentService = {
  processDocument: async (documentId: string, chunkSize = 500, chunkOverlap = 50) => {
    const document = await Document.findById(documentId);
    if (!document) {
      throw new ApiError(404, 'Document record not found');
    }

    logger.info(`Starting process flow for document: ${document.name} (${document.id})`);

    // 1. Parse document to text
    const text = await parserService.parseDocumentToText(document.filePath, document.mimeType);
    if (!text) {
      throw new ApiError(422, 'Failed to extract text from document');
    }

    // 2. Chunk text
    const chunks = chunkService.splitTextIntoChunks(text, chunkSize, chunkOverlap);
    logger.info(`Document split into ${chunks.length} chunks`);

    // 3. Generate embeddings & save chunks
    const embeddingRecords = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;
      const vector = await embeddingService.generateEmbedding(chunk);

      // Save chunk in DB
      const record = await Embedding.create({
        documentId: document.id,
        chunkIndex: i,
        content: chunk,
        vectorId: `vector-${document.id}-${i}`, // vector ID mapping
      });

      embeddingRecords.push(record);
    }

    // Update document meta
    document.chunkCount = chunks.length;
    document.chromaCollectionId = `coll-${document.id}`;
    await document.save();

    return {
      document,
      chunksProcessed: chunks.length,
    };
  },
};
