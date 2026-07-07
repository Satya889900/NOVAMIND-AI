import { z } from 'zod';

export const createRoomSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Room name must be at least 2 characters').max(50, 'Room name is too long'),
    isGroup: z.boolean().default(true),
    participantIds: z.array(z.string()).min(1, 'At least one participant is required'),
  }),
});

export const sendMessageSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
    type: z.enum(['text', 'image', 'file']).default('text'),
    fileUrl: z.string().optional(),
    fileName: z.string().optional(),
  }),
});
