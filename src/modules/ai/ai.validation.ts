import { z } from 'zod';

export const aiChatSchema = z.object({
  body: z.object({
    conversationId: z.string().min(1, 'conversationId is required'),
    message: z.string().min(1, 'message content is required'),
  }),
});