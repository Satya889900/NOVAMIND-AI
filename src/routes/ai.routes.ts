import { Router } from 'express';
import { handleAiChat } from '../modules/ai/ai.controller';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendMessageSchema } from '../validators/chat.validator';

const router = Router();

router.use(protect);

/**
 * POST /v1/ai/chat
 * Sends a message and gets an AI response
 * @param {string} conversationId - The conversation ID
 * @param {string} message - The user's message
 */
router.post('/chat', validate(sendMessageSchema), handleAiChat);

export const aiRouter = router;
