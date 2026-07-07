import { z } from 'zod';

export const updateUserProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    avatarUrl: z.string().url('Invalid avatar URL').optional(),
  }),
});
