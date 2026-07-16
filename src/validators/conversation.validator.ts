import { z } from 'zod';

export const createConversationSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name cannot be empty').max(50, 'Name is too long').optional(),
    isGroup: z.boolean().optional().default(false),
    participantIds: z.array(z.string()).optional().default([]),
    documentId: z.string().optional(),
  }),
});

export const renameConversationSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name cannot be empty').max(50, 'Name is too long'),
  }),
});
