import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';
import { redisClient, isRedisConnected } from '../config/redis';
import { logger } from '../config/logger';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const SESSION_TTL_SECONDS = 1800; // 30 minutes

export const protect = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new ApiError(401, 'Not authorized to access this resource'));
  }

  try {
    const decoded: any = jwt.verify(token, env.JWT_SECRET);
    const userId = decoded.id;
    const cacheKey = `user:${userId}`;

    let user: any = null;

    // 1. Try fetching user profile from Redis Session Cache
    if (isRedisConnected && redisClient) {
      try {
        const cachedUser = await redisClient.get(cacheKey);
        if (cachedUser) {
          user = JSON.parse(cachedUser);
        }
      } catch (err) {
        logger.debug('Redis session cache read error, falling back to MongoDB');
      }
    }

    // 2. If not in Redis cache, query MongoDB
    if (!user) {
      user = await User.findById(userId).lean();

      if (!user) {
        return next(new ApiError(404, 'No user found with this id'));
      }

      // 3. Save to Redis Session Cache (TTL = 30 min)
      if (isRedisConnected && redisClient) {
        try {
          await redisClient.set(cacheKey, JSON.stringify(user), 'EX', SESSION_TTL_SECONDS);
        } catch (err) {
          logger.debug('Failed to cache user session in Redis');
        }
      }
    }

    if (user) {
      user.id = (user._id || user.id)?.toString();
    }

    req.user = user;
    next();
  } catch (error) {
    return next(new ApiError(401, 'Token verification failed, not authorized'));
  }
});
