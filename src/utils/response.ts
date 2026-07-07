import { Response } from 'express';

export const sendResponse = <T>(
  res: Response,
  statusCode: number,
  success: boolean,
  message: string,
  data: T
): Response => {
  return res.status(statusCode).json({
    success,
    message,
    data,
  });
};

export const sendSuccess = <T>(
  res: Response,
  message: string,
  data: T,
  statusCode = 200
): Response => {
  return sendResponse(res, statusCode, true, message, data);
};

export const sendError = (
  res: Response,
  statusCode: number,
  message: string,
  errors: any[] = []
): Response => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};
