import { Document } from '../../models/Document';
import { DocumentChunk } from '../../models/DocumentChunk';
import { parserService } from './parser.service';
import { chunkService } from './chunk.service';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../config/logger';

export const documentService = {
  processDocument: async (documentId: string) => {
    const document = await Document.findById(documentId);
    if (!document) {
      throw new ApiError(404, 'Document record not found');
    }

    logger.info(`Starting process flow for document: ${document.originalName} (${document.id})`);

    // Transition: Uploaded -> Processing
    document.status = 'Processing';
    await document.save();

    try {
      // 1. Parse document to text
      const text = await parserService.parseDocumentToText(document.storagePath, document.fileType);
      
      // Transition: Processing -> Completed
      document.status = 'Completed';
      await document.save();

      // 2. Chunk text
      const chunks = chunkService.splitTextIntoChunks(text, 1000, 100);
      logger.info(`Document split into ${chunks.length} chunks`);

      // 3. Save chunks in DB
      const chunkRecords = chunks.map((chunk, index) => ({
        documentId: document.id,
        chunkIndex: index,
        content: chunk,
      }));

      if (chunkRecords.length > 0) {
        await DocumentChunk.insertMany(chunkRecords);
      }

      // Transition: Completed -> Ready
      document.status = 'Ready';
      await document.save();

      return {
        document,
        chunksProcessed: chunks.length,
      };
    } catch (error: any) {
      logger.error(`Failed to process document ${documentId}: ${error.message}`);
      
      // Transition to Failed
      document.status = 'Failed';
      await document.save();
      
      throw new ApiError(500, `Document processing failed: ${error.message}`);
    }
  },
};
