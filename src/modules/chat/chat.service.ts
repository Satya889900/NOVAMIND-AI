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
    fileName = ''
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
    });

    // Automatically name the conversation based on the first message
    if (!conversation.lastMessage) {
      if (!conversation.name || conversation.name === 'New Chat') {
        conversation.name = generateConversationTitle(content || type);
      }
    }

    conversation.lastMessage = message.id as any;
    await conversation.save();

    return await message.populate('senderId', 'name email avatarUrl status');
  },
};
