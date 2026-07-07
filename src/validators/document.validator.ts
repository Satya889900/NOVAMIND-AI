import { z } from 'zod';

export const parseDocumentSchema = z.object({
  body: z.object({
    documentId: z.string().min(1, 'Document ID is required'),
    chunkSize: z.coerce.number().min(100).max(2000).default(500),
    chunkOverlap: z.coerce.number().min(0).max(500).default(50),
  }),
});
