import { redisClient, isRedisConnected } from '../config/redis';
import { logger } from '../config/logger';

// In-memory mutex map fallback when Redis is offline
const inMemoryLocks = new Map<string, Promise<void>>();

export const aiQueueService = {
  /**
   * Enqueues and executes an AI task sequentially per conversation room.
   */
  enqueueTask: async <T>(roomId: string, taskFn: () => Promise<T>): Promise<T> => {
    if (isRedisConnected && redisClient) {
      const lockKey = `ai:lock:room:${roomId}`;
      let acquireAttempts = 0;

      // Spin-lock until lock is acquired or timeout
      while (acquireAttempts < 60) {
        // Try setting lock with EX = 45s (auto release if crashed)
        const acquired = await redisClient.set(lockKey, 'locked', 'EX', 45, 'NX');
        if (acquired === 'OK') {
          try {
            logger.info(`Acquired Redis lock for room ${roomId}. Executing AI task...`);
            const result = await taskFn();
            return result;
          } finally {
            await redisClient.del(lockKey);
            logger.info(`Released Redis lock for room ${roomId}.`);
          }
        }

        // Wait 500ms before retrying
        acquireAttempts++;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      logger.warn(`Redis lock acquisition timed out for room ${roomId}. Executing task anyway.`);
      return await taskFn();
    }

    // In-memory sequential fallback
    const currentPromise = inMemoryLocks.get(roomId) || Promise.resolve();
    let resolveNext: () => void;
    const nextPromise = new Promise<void>((res) => {
      resolveNext = res;
    });

    inMemoryLocks.set(roomId, nextPromise);

    try {
      await currentPromise;
      return await taskFn();
    } finally {
      resolveNext!();
      if (inMemoryLocks.get(roomId) === nextPromise) {
        inMemoryLocks.delete(roomId);
      }
    }
  },
};
