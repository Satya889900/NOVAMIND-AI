import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { redisClient, isRedisConnected } from '../config/redis';
import { logger } from '../config/logger';

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

const points = isDev ? 10000 : 60; // 60 requests per minute
const duration = 60; // 60 seconds TTL window

const memoryLimiter = new RateLimiterMemory({
  points,
  duration,
});

export const apiLimiter = async (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const key = req.user ? `user:${req.user.id}` : `ip:${ip}`;

  try {
    if (isRedisConnected && redisClient) {
      const redisLimiter = new RateLimiterRedis({
        storeClient: redisClient,
        keyPrefix: 'rate_limit',
        points,
        duration,
      });
      await redisLimiter.consume(key);
    } else {
      await memoryLimiter.consume(key);
    }
    next();
  } catch (rejRes: any) {
    logger.warn(`Rate limit exceeded for ${key}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please slow down and try again in a minute.',
    });
  }
};
