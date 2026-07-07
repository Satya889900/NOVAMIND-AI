import { Router } from 'express';
import { getMessages, sendMessage } from './chat.controller';
import { validate } from '../../middleware/validate';
import { sendMessageSchema } from '../../validators/chat.validator';
import { protect } from '../../middleware/auth';

const router = Router();

router.use(protect);

router.get('/:roomId/messages', getMessages);
router.post('/:roomId/messages', validate(sendMessageSchema), sendMessage);

export const chatRouter = router;
