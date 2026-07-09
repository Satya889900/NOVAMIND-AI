import { Router } from 'express';
import { getHealth, getStatus, getVersion } from '../modules/system/system.controller';

const router = Router();

router.get('/health', getHealth);
router.get('/status', getStatus);
router.get('/version', getVersion);

export const systemRouter = router;
