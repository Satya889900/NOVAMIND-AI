import { Queue } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { isRedisConnected } from '../config/redis';
import { DocumentJobData } from '../workers/documentWorker';

let documentQueue: Queue<DocumentJobData> | null = null;
let queueErrorLogged = false;

try {
  documentQueue = new Queue<DocumentJobData>('document-processing', {
    connection: {
      url: env.REDIS_URL,
      maxRetriesPerRequest: null,
      retryStrategy(times: number) {
        if (times > 3) {
          return null; // Stop retrying when Redis is offline
        }
        return Math.min(times * 200, 2000);
      },
    },
  });

  documentQueue.on('error', () => {
    // Suppress redundant error events (handled by redis.ts fallback logging)
  });
} catch (err: any) {
  logger.warn(`Failed to initialize BullMQ documentQueue: ${err.message}`);
}

export const queueService = {
  addJob: async (queueName: string, jobData: any): Promise<void> => {
    if (isRedisConnected && documentQueue && queueName === 'document-processing') {
      try {
        await documentQueue.add('process-document', jobData, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        });
        logger.info(`[BullMQ] Enqueued document job: ${JSON.stringify(jobData)}`);
        return;
      } catch (err: any) {
        logger.warn(`BullMQ addJob error: ${err.message}`);
      }
    }

    // Fallback sync logging when Redis is unavailable
    logger.info(`Job added to queue '${queueName}': ${JSON.stringify(jobData)} - Fallback mode`);
  },
};
