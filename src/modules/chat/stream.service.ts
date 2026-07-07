import { Response } from 'express';
import { logger } from '../../config/logger';

export const streamService = {
  streamTextResponse: (res: Response, contentChunks: string[], delayMs = 100) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let chunkIndex = 0;
    const interval = setInterval(() => {
      if (chunkIndex < contentChunks.length) {
        const data = JSON.stringify({ chunk: contentChunks[chunkIndex] });
        res.write(`data: ${data}\n\n`);
        chunkIndex++;
      } else {
        res.write('data: [DONE]\n\n');
        clearInterval(interval);
        res.end();
      }
    }, delayMs);

    res.on('close', () => {
      clearInterval(interval);
      logger.info('SSE stream closed by client');
    });
  },
};
