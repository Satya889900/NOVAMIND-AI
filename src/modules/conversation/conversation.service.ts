import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
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
      name: isGroup ? (name || '') : '',
      isGroup,
      participants: list,
    });

    return await conversation.populate('participants', 'name email avatarUrl status');
  },

  getRoomById: async (roomId: string, userId: string) => {
    const conversation = await Conversation.findOne({ _id: roomId, participants: userId })
      .populate('participants', 'name email avatarUrl status')
      .populate('lastMessage');
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found or access denied');
    }
    return conversation;
  },

  renameRoom: async (roomId: string, name: string, userId: string) => {
    const conversation = await Conversation.findOneAndUpdate(
      { _id: roomId, participants: userId },
      { name },
      { new: true }
    ).populate('participants', 'name email avatarUrl status');
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found or access denied');
    }
    return conversation;
  },

  deleteRoom: async (roomId: string, userId: string) => {
    const conversation = await Conversation.findOne({ _id: roomId, participants: userId });
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found or access denied');
    }
    await Conversation.deleteOne({ _id: roomId });
    await Message.deleteMany({ conversationId: roomId });
    return { id: roomId };
  },
};
