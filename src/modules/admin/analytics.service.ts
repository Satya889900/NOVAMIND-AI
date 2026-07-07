import { User } from '../../models/User';
import { Message } from '../../models/Message';
import { Document } from '../../models/Document';

export const analyticsService = {
  getSystemAnalytics: async () => {
    const userCount = await User.countDocuments();
    const messageCount = await Message.countDocuments();
    const documentCount = await Document.countDocuments();

    // Sum document sizes
    const documents = await Document.find({});
    const totalStorageBytes = documents.reduce((sum, doc) => sum + (doc.sizeBytes || 0), 0);

    return {
      users: { total: userCount },
      messages: { total: messageCount },
      documents: {
        total: documentCount,
        totalStorageBytes,
      },
    };
  },
};
