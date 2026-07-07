import { Router } from 'express';
import { getDashboardSummary } from './dashboard.controller';
import { protect } from '../../middleware/auth';

const router = Router();

router.use(protect);

router.get('/summary', getDashboardSummary);

export const dashboardRouter = router;
