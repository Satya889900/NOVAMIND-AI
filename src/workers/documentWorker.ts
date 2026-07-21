import { Worker, Job } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { documentService } from '../modules/documents/document.service';

export interface DocumentJobData {
  documentId: string;
  filePath?: string;
  fileType?: string;
  userId: string;
}

let workerErrorLogged = false;

export function startDocumentWorker() {
  try {
    const worker = new Worker<DocumentJobData>(
      'document-processing',
      async (job: Job<DocumentJobData>) => {
        logger.info(`[BullMQ Worker] Processing job #${job.id} for document ${job.data.documentId}...`);
        
        // Process document (chunking, vector indexing in ChromaDB, AI summary)
        if (job.data.documentId) {
          await documentService.processDocument(job.data.documentId);
        }

        logger.info(`[BullMQ Worker] Finished job #${job.id} for document ${job.data.documentId}.`);
      },
      {
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
        concurrency: 5,
      }
    );

    worker.on('error', () => {
      // Suppress redundant error events (handled by redis.ts fallback logging)
    });

    worker.on('failed', (job, err) => {
      logger.error(`[BullMQ Worker] Job #${job?.id} failed: ${err.message}`);
    });

    logger.info('BullMQ Document Processing Worker started successfully.');
  } catch (err: any) {
    logger.warn(`Failed to start BullMQ Worker: ${err.message}`);
  }
}
