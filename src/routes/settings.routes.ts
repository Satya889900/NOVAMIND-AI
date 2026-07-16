import { Router } from 'express';
import { getSettings, updateSettings, getProviders } from '../modules/settings/settings.controller';
import { protect } from '../middleware/auth';

const router = Router();

// Public – no auth needed to know which providers are available
router.get('/providers', getProviders);

router.use(protect);

router.get('/', getSettings);
router.put('/', updateSettings);

export const settingsRouter = router;
