import { Request, Response } from 'express';
import { authService } from './auth.service';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  const data = await authService.registerUser(name, email, password);
  return sendSuccess(res, 'User registered successfully', data, 201);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, deviceId } = req.body;
  const data = await authService.loginUser(email, password, deviceId);
  return sendSuccess(res, 'User logged in successfully', data);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  const data = await authService.refreshTokens(refreshToken);
  return sendSuccess(res, 'Tokens refreshed successfully', data);
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, 'Current active user profile retrieved', {
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    avatarUrl: req.user.avatarUrl,
    role: req.user.role,
    status: req.user.status,
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, 'Logged out successfully', null);
});
