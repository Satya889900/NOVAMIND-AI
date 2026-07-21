import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import { Document } from '../../models/Document';
import { DocumentChunk } from '../../models/DocumentChunk';
import { deleteFromCloudinary } from '../../config/multer';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../config/logger';

export const conversationService = {
  getRoomsByUser: async (userId: string) => {
    return await Conversation.find({ participants: userId })
      .populate('participants', 'name email avatarUrl status')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });
  },

  createRoom: async (name: string, isGroup: boolean, participantIds: string[], creatorId: string, documentId?: string) => {
    const list = [...new Set([...participantIds, creatorId])];

    const conversation = await Conversation.create({
      name: name || '',
      isGroup,
      participants: list,
      documentId,
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

    // 1. Delete all NON-STARRED documents created inside this conversation
    // Starred documents are protected and must be deleted manually by the user
    const conversationDocs = await Document.find({ conversationId: roomId });
    if (conversationDocs.length > 0) {
      const docsToDelete = conversationDocs.filter((d) => !d.isStarred);
      const skipped = conversationDocs.length - docsToDelete.length;
      if (skipped > 0) {
        logger.info(`Skipping ${skipped} starred document(s) — protected from auto-deletion`);
      }

      if (docsToDelete.length > 0) {
        logger.info(`Deleting ${docsToDelete.length} non-starred document(s) from conversation ${roomId}`);

        // Run all Cloudinary deletions and chunk DB deletions in PARALLEL for speed
        const docIds = docsToDelete.map((d) => d._id);

        const cloudinaryCleanups = docsToDelete.map((doc) => {
          const resourceType = doc.fileType.startsWith('image/') ? 'image' : 'raw';
          return doc.cloudinaryPublicId
            ? deleteFromCloudinary(doc.cloudinaryPublicId, resourceType).catch((err) =>
                logger.warn(`Cloudinary delete failed for ${doc.cloudinaryPublicId}: ${err.message}`)
              )
            : Promise.resolve();
        });

        // Fire Cloudinary deletions + chunk DB deletion all at once, don't await them —
        // return the HTTP response immediately and let cleanup finish in the background.
        Promise.allSettled([
          ...cloudinaryCleanups,
          DocumentChunk.deleteMany({ documentId: { $in: docIds } }),
        ]).catch((err) => logger.warn(`Background cleanup error: ${err.message}`));

        // DB document records deletion — fast, no external network call
        await Document.deleteMany({
          conversationId: roomId,
          isStarred: { $ne: true },
        });
      }
    }

    // 2. Delete all messages in the conversation
    await Message.deleteMany({ conversationId: roomId });

    // 3. Delete the conversation itself
    await Conversation.deleteOne({ _id: roomId });

    logger.info(`Conversation ${roomId} and all associated data deleted successfully`);
    return { id: roomId };
  },
};
