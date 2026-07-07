import { Conversation } from '../../models/Conversation';
import { Document } from '../../models/Document';

export const dashboardService = {
  getUserDashboardSummary: async (userId: string) => {
    // 1. Get recent conversations count
    const conversationCount = await Conversation.countDocuments({ participants: userId });

    // 2. Get document uploads count
    const documentCount = await Document.countDocuments({ userId });

    // 3. Get recent conversations
    const recentConversations = await Conversation.find({ participants: userId })
      .populate('lastMessage')
      .sort({ updatedAt: -1 })
      .limit(5);

    return {
      chatsCount: conversationCount,
      documentsCount: documentCount,
      recentConversations,
    };
  },
};
