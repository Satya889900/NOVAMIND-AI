import { Router } from 'express';
import { getUser, getUsers, updateProfile } from '../modules/users/user.controller';
import { validate } from '../middleware/validate';
import { updateUserProfileSchema } from '../validators/user.validator';
import { protect } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/', getUsers);
router.get('/:id', getUser);
router.put('/profile', validate(updateUserProfileSchema), updateProfile);

export const userRouter = router;
