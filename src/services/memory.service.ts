import { Message } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { ProviderFactory } from '../modules/ai/providers/provider.factory';
import { logger } from '../config/logger';

export const memoryService = {
  /**
   * Builds context-aware message history for AI models.
   * If conversation has > 10 messages, auto-summarizes older messages,
   * stores the summary in DB, and includes it with recent 10 messages.
   */
  getConversationHistory: async (roomId: string, botUserId: string, modelName = 'gemini-3.1-flash-lite') => {
    const allMessages = await Message.find({ conversationId: roomId })
      .sort({ createdAt: 1 })
      .lean();

    if (allMessages.length === 0) {
      return [];
    }

    const conversation = await Conversation.findById(roomId);
    let summary = conversation?.summary || '';

    // If more than 10 messages in total, trigger auto-summarization of earlier turns
    if (allMessages.length > 10) {
      const messagesToSummarize = allMessages.slice(0, allMessages.length - 10);
      const textToSummarize = messagesToSummarize
        .map(m => `${m.senderId.toString() === botUserId ? 'AI' : 'User'}: ${m.content}`)
        .join('\n');

      try {
        const provider = ProviderFactory.getProvider(modelName);
        const prompt = `Summarize the key context, active topics, programming languages, and decisions from this conversation in 2-3 concise sentences:\n\n${textToSummarize}`;
        
        const newSummary = await provider.generateResponse(prompt, {
          model: modelName,
          temperature: 0.2,
          maxTokens: 150,
        });

        if (newSummary && newSummary.trim()) {
          summary = newSummary.trim();
          if (conversation) {
            conversation.summary = summary;
            await conversation.save();
            logger.info(`Updated conversation ${roomId} memory summary in DB.`);
          }
        }
      } catch (sumErr: any) {
        logger.warn(`Failed to update conversation summary: ${sumErr.message}`);
      }
    }

    // Keep the last 10 messages for immediate dialog context
    const recentMessages = allMessages.length > 10 ? allMessages.slice(-10) : allMessages;

    const formattedHistory = recentMessages.map(msg => ({
      role: msg.senderId.toString() === botUserId ? ('assistant' as const) : ('user' as const),
      content: msg.content,
    }));

    // Prepend the summary as context if available
    if (summary) {
      const summaryContextTurn = [
        {
          role: 'user' as const,
          content: `[Active Conversation Context & Long-Term Memory Summary]:\n${summary}\n\nPlease maintain this ongoing context for all subsequent questions unless the user explicitly switches topics.`,
        },
        {
          role: 'assistant' as const,
          content: `Understood. I have full context of our conversation and will keep responses aligned with our active topic unless a new topic is explicitly introduced.`,
        },
      ];
      return [...summaryContextTurn, ...formattedHistory];
    }

    return formattedHistory;
  },
};
