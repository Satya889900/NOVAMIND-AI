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

    // 1. Delete file from Cloudinary
    if (document.cloudinaryPublicId) {
      await deleteFromCloudinary(document.cloudinaryPublicId);
    }

    // 2. Delete related chunks in the database
    await DocumentChunk.deleteMany({ documentId: id });

    // 3. Delete related chunks in ChromaDB
    try {
      const { chromaService } = require('./chroma.service');
      await chromaService.deleteDocumentChunks(id);
    } catch (chromaErr: any) {
      logger.warn(`Failed to clean up ChromaDB index for document ${id}: ${chromaErr.message}`);
    }

    // 4. Delete document record in the database
    await Document.deleteOne({ _id: id });


    logger.info(`Document ${id} and its chunks deleted successfully`);

    return { id };
  },
};
