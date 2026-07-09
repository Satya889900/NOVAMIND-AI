import { Router } from 'express';
import { getRooms, createRoom, getRoomById, renameRoom, deleteRoom } from '../modules/conversation/conversation.controller';
import { validate } from '../middleware/validate';
import { createConversationSchema, renameConversationSchema } from '../validators/conversation.validator';
import { protect } from '../middleware/auth';
import { getMessages, sendMessage } from '../modules/chat/chat.controller';
import { sendMessageSchema } from '../validators/chat.validator';

const router = Router();

router.use(protect);

router.get('/', getRooms);
router.post('/', validate(createConversationSchema), createRoom);
router.get('/:id', getRoomById);
router.patch('/:id', validate(renameConversationSchema), renameRoom);
router.delete('/:id', deleteRoom);

// Message routes under conversation namespace
router.get('/:roomId/messages', getMessages);
router.post('/:roomId/messages', validate(sendMessageSchema), sendMessage);

export const conversationRouter = router;
