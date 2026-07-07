import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    next(new ApiError(403, 'Access denied, administrator role required'));
  }
};
