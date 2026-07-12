import { Router } from 'express';
import { authRouter } from './auth.routes';
import { userRouter } from './user.routes';
import { chatRouter } from './chat.routes';
import { conversationRouter } from './conversation.routes';
import { documentRouter } from './document.routes';
import { adminRouter } from './admin.routes';
import { dashboardRouter } from './dashboard.routes';
import { systemRouter } from './system.routes';
import { aiRouter } from './ai.routes';

const router = Router();

// Version 1 router group
const v1Router = Router();

v1Router.use('/', systemRouter);
v1Router.use('/auth', authRouter);
v1Router.use('/users', userRouter);
v1Router.use('/chats', chatRouter);
v1Router.use('/conversations', conversationRouter);
v1Router.use('/documents', documentRouter);
v1Router.use('/admin', adminRouter);
v1Router.use('/dashboard', dashboardRouter);
v1Router.use('/ai', aiRouter);

router.use('/v1', v1Router);

export default router;
