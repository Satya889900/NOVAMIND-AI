import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

export let redisClient: Redis;
export let isRedisConnected = false;

let hasLoggedOfflineWarning = false;

try {
  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) {
        if (!hasLoggedOfflineWarning) {
          logger.warn('Redis server offline. App operating in graceful fallback mode.');
          hasLoggedOfflineWarning = true;
        }
        return null; // Stop retrying automatically to avoid flooding logs
      }
      return Math.min(times * 200, 2000);
    },
    lazyConnect: false,
  });

  redisClient.on('connect', () => {
    isRedisConnected = true;
    hasLoggedOfflineWarning = false;
    logger.info('Connected to Redis server successfully.');
  });

  redisClient.on('ready', () => {
    isRedisConnected = true;
  });

  redisClient.on('error', () => {
    isRedisConnected = false;
    if (!hasLoggedOfflineWarning) {
      logger.warn('Redis server offline. App operating in graceful fallback mode.');
      hasLoggedOfflineWarning = true;
    }
  });

  redisClient.on('end', () => {
    isRedisConnected = false;
  });
} catch (err: any) {
  isRedisConnected = false;
  logger.warn(`Failed to initialize Redis client: ${err.message}. Operating in memory fallback mode.`);
}
