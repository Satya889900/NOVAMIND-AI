import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { userRouter } from '../modules/users/user.routes';
import { chatRouter } from '../modules/chat/chat.routes';
import { conversationRouter } from '../modules/conversation/conversation.routes';
import { documentRouter } from '../modules/documents/document.routes';
import { adminRouter } from '../modules/admin/admin.routes';
import { dashboardRouter } from '../modules/dashboard/dashboard.routes';

const router = Router();

router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/chats', chatRouter);
router.use('/conversations', conversationRouter);
router.use('/documents', documentRouter);
router.use('/admin', adminRouter);
router.use('/dashboard', dashboardRouter);

export default router;
