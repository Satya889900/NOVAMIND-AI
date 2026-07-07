import { logger } from '../config/logger';

export const queueService = {
  addJob: async (queueName: string, jobData: any): Promise<void> => {
    logger.info(`Job added to queue '${queueName}': ${JSON.stringify(jobData)} - Mock implementation`);
  },
};
