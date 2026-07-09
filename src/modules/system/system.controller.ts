import { Request, Response } from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { env } from '../../config/env';

// Load version info
let backendVersion = '1.0.0';
try {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  backendVersion = packageJson.version || '1.0.0';
} catch (error) {
  // Fallback to default
}

export const getHealth = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, 'Backend service is healthy and running', {
    status: 'UP',
    timestamp: new Date().toISOString(),
  });
});

export const getStatus = asyncHandler(async (req: Request, res: Response) => {
  const dbState = mongoose.connection.readyState;
  let dbStatus = 'disconnected';
  if (dbState === 1) dbStatus = 'connected';
  else if (dbState === 2) dbStatus = 'connecting';
  else if (dbState === 3) dbStatus = 'disconnecting';

  return sendSuccess(res, 'Server status retrieved successfully', {
    status: 'active',
    database: dbStatus,
    environment: env.NODE_ENV,
    uptime: process.uptime(), // seconds
  });
});

export const getVersion = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, 'Version information retrieved successfully', {
    apiVersion: 'v1',
    backendVersion,
    nodeVersion: process.version,
  });
});
