import { Router } from 'express';
import { getSystemMetrics, removeUser, listAllRooms } from './admin.controller';
import { protect } from '../../middleware/auth';
import { adminOnly } from '../../middleware/admin';

const router = Router();

router.use(protect, adminOnly);

router.get('/metrics', getSystemMetrics);
router.get('/rooms', listAllRooms);
router.delete('/users/:id', removeUser);

export const adminRouter = router;
