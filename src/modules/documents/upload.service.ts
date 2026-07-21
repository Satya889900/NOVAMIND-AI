import { Document } from '../../models/Document';
import { DocumentChunk } from '../../models/DocumentChunk';
import { deleteFromCloudinary } from '../../config/multer';
import { logger } from '../../config/logger';

export const uploadService = {
  getDocumentsByUser: async (userId: string) => {
    return await Document.find({ userId }).sort({ createdAt: -1 });
  },

  getDocumentById: async (id: string, userId: string) => {
    return await Document.findOne({ _id: id, userId });
  },

  deleteDocument: async (id: string, userId: string) => {
    const document = await Document.findOne({ _id: id, userId });
    if (!document) {
      throw new Error('Document not found or access denied');
    }

    // 1. Delete document and chunks records from DB immediately (fast, no external calls)
    await DocumentChunk.deleteMany({ documentId: id });
    await Document.deleteOne({ _id: id });

    // 2. Fire Cloudinary + ChromaDB cleanups in the background (non-blocking)
    //    so the HTTP response is returned instantly without waiting for external APIs
    const cleanups: Promise<any>[] = [];

    if (document.cloudinaryPublicId) {
      cleanups.push(
        deleteFromCloudinary(document.cloudinaryPublicId).catch((err: any) =>
          logger.warn(`Cloudinary delete failed for ${document.cloudinaryPublicId}: ${err.message}`)
        )
      );
    }

    cleanups.push(
      Promise.resolve().then(async () => {
        try {
          const { chromaService } = require('./chroma.service');
          await chromaService.deleteDocumentChunks(id);
        } catch (chromaErr: any) {
          logger.warn(`Failed to clean up ChromaDB index for document ${id}: ${chromaErr.message}`);
        }
      })
    );

    Promise.allSettled(cleanups).catch((err: any) =>
      logger.warn(`Background document cleanup error: ${err.message}`)
    );

    logger.info(`Document ${id} record deleted successfully; background cleanup running.`);
    return { id };
  },
};
