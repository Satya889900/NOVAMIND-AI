import { Router } from 'express';
import { getRooms, createRoom } from './conversation.controller';
import { validate } from '../../middleware/validate';
import { createRoomSchema } from '../../validators/chat.validator';
import { protect } from '../../middleware/auth';

const router = Router();

router.use(protect);

router.get('/', getRooms);
router.post('/', validate(createRoomSchema), createRoom);

export const conversationRouter = router;
