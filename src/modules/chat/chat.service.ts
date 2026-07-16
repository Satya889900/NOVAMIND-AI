import { Message } from '../../models/Message';
import { Conversation } from '../../models/Conversation';
import { ApiError } from '../../utils/ApiError';
import { generateConversationTitle } from '../../utils/generateTitle';

export const chatService = {
  getMessagesByRoom: async (roomId: string) => {
    return await Message.find({ conversationId: roomId })
      .populate('senderId', 'name email avatarUrl status')
      .sort({ createdAt: 1 });
  },

  createMessage: async (
    roomId: string,
    senderId: string,
    content: string,
    type: 'text' | 'image' | 'file' = 'text',
    fileUrl = '',
    fileName = '',
    model = ''
  ) => {
    const conversation = await Conversation.findById(roomId);
    if (!conversation) {
      throw new ApiError(404, 'Conversation room not found');
    }

    const message = await Message.create({
      conversationId: roomId,
      senderId,
      content,
      type,
      fileUrl,
      fileName,
      model,
    });

    conversation.lastMessage = message.id as any;
    await conversation.save();

    return await message.populate('senderId', 'name email avatarUrl status');
  },

  /**
   * Renames a conversation. Called externally (e.g., from chat.controller after AI title generation).
   */
  renameConversation: async (roomId: string, name: string) => {
    await Conversation.findByIdAndUpdate(roomId, { name });
  },
};
