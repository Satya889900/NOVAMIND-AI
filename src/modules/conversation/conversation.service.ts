import { Conversation } from '../../models/Conversation';
import { ApiError } from '../../utils/ApiError';

export const conversationService = {
  getRoomsByUser: async (userId: string) => {
    return await Conversation.find({ participants: userId })
      .populate('participants', 'name email avatarUrl status')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });
  },

  createRoom: async (name: string, isGroup: boolean, participantIds: string[], creatorId: string) => {
    const list = [...new Set([...participantIds, creatorId])];

    const conversation = await Conversation.create({
      name: isGroup ? name : '',
      isGroup,
      participants: list,
    });

    return await conversation.populate('participants', 'name email avatarUrl status');
  },
};
