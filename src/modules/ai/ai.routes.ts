import { Router } from 'express';
import { handleAiChat } from './ai.controller';
import { validate } from '../../middleware/validate';
import { aiChatSchema } from './ai.validation';
import { protect } from '../../middleware/auth';

const router = Router();

// All AI routes are protected
router.use(protect);

router.post('/chat', validate(aiChatSchema), handleAiChat);

export const aiRoutes = router;