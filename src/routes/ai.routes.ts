import { Router } from 'express';
import { handleAiChat, handleTts } from '../modules/ai/ai.controller';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendMessageSchema } from '../validators/chat.validator';

const router = Router();

router.use(protect);

/**
 * POST /v1/ai/chat
 * Sends a message and gets an AI response
 */
router.post('/chat', validate(sendMessageSchema), handleAiChat);

/**
 * POST /v1/ai/tts
 * Generates TTS audio stream URL for a given text payload
 */
router.post('/tts', handleTts);

export const aiRouter = router;
