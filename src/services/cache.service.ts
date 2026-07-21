import { redisClient, isRedisConnected } from '../config/redis';
import { logger } from '../config/logger';

const memoryStore = new Map<string, { value: any; expiry: number }>();

export const cacheService = {
  /**
   * Retrieves a cached value by key from Redis or Memory.
   */
  get: async <T>(key: string): Promise<T | null> => {
    if (isRedisConnected && redisClient) {
      try {
        const raw = await redisClient.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
      } catch (err: any) {
        logger.warn(`Redis cache get error (${key}): ${err.message}`);
      }
    }

    // Memory fallback
    const item = memoryStore.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      memoryStore.delete(key);
      return null;
    }
    return item.value as T;
  },

  /**
   * Caches a key-value pair with a TTL (default 300s = 5m).
   */
  set: async (key: string, value: any, ttlSeconds = 300): Promise<void> => {
    if (isRedisConnected && redisClient) {
      try {
        await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        logger.debug(`Redis cached key: ${key} for ${ttlSeconds}s`);
        return;
      } catch (err: any) {
        logger.warn(`Redis cache set error (${key}): ${err.message}`);
      }
    }

    // Memory fallback
    const expiry = Date.now() + ttlSeconds * 1000;
    memoryStore.set(key, { value, expiry });
    logger.debug(`Memory cached key: ${key} for ${ttlSeconds}s`);
  },

  /**
   * Deletes a key from Redis or Memory.
   */
  del: async (key: string): Promise<void> => {
    if (isRedisConnected && redisClient) {
      try {
        await redisClient.del(key);
      } catch (err: any) {
        logger.warn(`Redis cache del error (${key}): ${err.message}`);
      }
    }
    memoryStore.delete(key);
  },

  /**
   * Caches a conversation or document summary (1 hour default TTL).
   */
  cacheSummary: async (summaryId: string, summaryText: string, ttlSeconds = 3600): Promise<void> => {
    const key = `summary:${summaryId}`;
    await cacheService.set(key, summaryText, ttlSeconds);
  },

  /**
   * Retrieves a cached summary by summaryId.
   */
  getSummary: async (summaryId: string): Promise<string | null> => {
    const key = `summary:${summaryId}`;
    return await cacheService.get<string>(key);
  },
};
