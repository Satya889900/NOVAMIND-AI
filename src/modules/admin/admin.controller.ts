import { Request, Response } from 'express';
import { adminService } from './admin.service';
import { analyticsService } from './analytics.service';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';

export const getSystemMetrics = asyncHandler(async (req: Request, res: Response) => {
  const metrics = await analyticsService.getSystemAnalytics();
  return sendSuccess(res, 'System metrics analytics retrieved successfully', metrics);
});

export const removeUser = asyncHandler(async (req: Request, res: Response) => {
  const removedUser = await adminService.deleteUserByAdmin(req.params.id);
  return sendSuccess(res, 'User accounts deleted successfully by Administrator', removedUser);
});

export const listAllRooms = asyncHandler(async (req: Request, res: Response) => {
  const rooms = await adminService.getAllRoomsByAdmin();
  return sendSuccess(res, 'All active conversations list retrieved successfully', rooms);
});
