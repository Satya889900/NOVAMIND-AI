import { AIChatMessage } from './ai.types';

const chatMemories = new Map<string, AIChatMessage[]>();

export const memoryService = {
  getMemory: (conversationId: string): AIChatMessage[] => {
    return chatMemories.get(conversationId) || [];
  },

  addMessageToMemory: (conversationId: string, role: 'user' | 'model', content: string) => {
    const history = chatMemories.get(conversationId) || [];
    history.push({ role, content });
    
    // Cap memory history size to last 20 messages
    if (history.length > 20) {
      history.shift();
    }
    chatMemories.set(conversationId, history);
  },

  clearMemory: (conversationId: string) => {
    chatMemories.delete(conversationId);
  },
};
