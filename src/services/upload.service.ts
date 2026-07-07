import { Document } from '../models/Document';

export const uploadService = {
  saveDocumentMetadata: async (
    name: string,
    filePath: string,
    mimeType: string,
    sizeBytes: number,
    userId: string
  ) => {
    return await Document.create({
      name,
      filePath,
      mimeType,
      sizeBytes,
      userId,
    });
  },
};
