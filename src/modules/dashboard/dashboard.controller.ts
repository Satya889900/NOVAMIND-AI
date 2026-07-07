import { Request, Response } from 'express';
import { dashboardService } from './dashboard.service';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';

export const getDashboardSummary = asyncHandler(async (req: Request, res: Response) => {
  const summary = await dashboardService.getUserDashboardSummary(req.user.id);
  return sendSuccess(res, 'User dashboard summary retrieved successfully', summary);
});
