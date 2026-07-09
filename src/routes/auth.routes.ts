import { Router } from 'express';
import { register, login, getMe, logout, refresh } from '../modules/auth/auth.controller';
import { validate } from '../middleware/validate';
import { loginSchema, registerSchema, refreshTokenSchema } from '../validators/auth.validator';
import { protect } from '../middleware/auth';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.post('/refresh', validate(refreshTokenSchema), refresh);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

export const authRouter = router;
