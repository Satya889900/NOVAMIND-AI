import { Router } from 'express';
import { getMessages, sendMessage, uploadChatAttachment } from '../modules/chat/chat.controller';
import { validate } from '../middleware/validate';
import { sendMessageSchema } from '../validators/chat.validator';
import { protect } from '../middleware/auth';
import { parseChatFile } from '../middleware/upload';

const router = Router();

router.use(protect);

router.post('/upload', parseChatFile, uploadChatAttachment);
router.get('/:roomId/messages', getMessages);
router.post('/:roomId/messages', validate(sendMessageSchema), sendMessage);

export const chatRouter = router;
