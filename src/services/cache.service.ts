import { logger } from '../config/logger';

const store = new Map<string, { value: any; expiry: number }>();

export const cacheService = {
  get: async <T>(key: string): Promise<T | null> => {
    const item = store.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      store.delete(key);
      return null;
    }
    return item.value as T;
  },

  set: async (key: string, value: any, ttlSeconds = 300): Promise<void> => {
    const expiry = Date.now() + (ttlSeconds * 1000);
    store.set(key, { value, expiry });
    logger.debug(`Cached key: ${key} for ${ttlSeconds}s`);
  },

  del: async (key: string): Promise<void> => {
    store.delete(key);
  },
};
