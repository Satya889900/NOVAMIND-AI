import { Document } from '../../models/Document';

export const uploadService = {
  getDocumentsByUser: async (userId: string) => {
    return await Document.find({ userId });
  },

  deleteDocumentMetadata: async (id: string) => {
    return await Document.findByIdAndDelete(id);
  },
};
