import { Request, Response } from 'express';
import { userService } from './user.service';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getUserById(req.params.id);
  return sendSuccess(res, 'User profile retrieved successfully', user);
});

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await userService.getAllUsers();
  return sendSuccess(res, 'All users list retrieved successfully', users);
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.updateUserProfile(req.user.id, req.body);
  return sendSuccess(res, 'User profile updated successfully', user);
});
