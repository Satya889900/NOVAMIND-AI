import { redisClient, isRedisConnected } from '../config/redis';
import { logger } from '../config/logger';

const memoryOtpStore = new Map<string, { code: string; expiry: number }>();
const DEFAULT_OTP_TTL = 300; // 5 minutes

export const otpService = {
  /**
   * Generates and stores a 6-digit numeric OTP code for an email/user.
   */
  generateAndStoreOtp: async (identifier: string, ttlSeconds = DEFAULT_OTP_TTL): Promise<string> => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `otp:${identifier}`;

    if (isRedisConnected && redisClient) {
      try {
        await redisClient.set(key, code, 'EX', ttlSeconds);
        logger.info(`Stored OTP for ${identifier} in Redis (TTL = ${ttlSeconds}s)`);
        return code;
      } catch (err: any) {
        logger.warn(`Redis OTP store error: ${err.message}`);
      }
    }

    // Memory fallback
    const expiry = Date.now() + ttlSeconds * 1000;
    memoryOtpStore.set(identifier, { code, expiry });
    logger.info(`Stored OTP for ${identifier} in Memory (TTL = ${ttlSeconds}s)`);
    return code;
  },

  /**
   * Verifies an OTP code for an email/user.
   */
  verifyOtp: async (identifier: string, inputCode: string): Promise<boolean> => {
    const key = `otp:${identifier}`;

    if (isRedisConnected && redisClient) {
      try {
        const storedCode = await redisClient.get(key);
        if (storedCode && storedCode === inputCode) {
          await redisClient.del(key); // One-time use: delete after verification
          return true;
        }
        return false;
      } catch (err: any) {
        logger.warn(`Redis OTP verify error: ${err.message}`);
      }
    }

    // Memory fallback
    const item = memoryOtpStore.get(identifier);
    if (!item) return false;
    if (Date.now() > item.expiry) {
      memoryOtpStore.delete(identifier);
      return false;
    }

    if (item.code === inputCode) {
      memoryOtpStore.delete(identifier);
      return true;
    }

    return false;
  },
};
