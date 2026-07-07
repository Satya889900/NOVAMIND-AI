import { Router } from 'express';
import { register, login, getMe, logout } from './auth.controller';
import { validate } from '../../middleware/validate';
import { loginSchema, registerSchema } from '../../validators/auth.validator';
import { protect } from '../../middleware/auth';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

export const authRouter = router;
