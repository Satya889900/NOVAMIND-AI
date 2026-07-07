import fs from 'fs';
import { logger } from '../../config/logger';

export const parserService = {
  parseDocumentToText: async (filePath: string, mimeType: string): Promise<string> => {
    logger.info(`Parsing document at ${filePath} (${mimeType}) - Mock implementation`);
    try {
      if (fs.existsSync(filePath)) {
        // Read file contents if it is plain text
        if (mimeType === 'text/plain') {
          return fs.readFileSync(filePath, 'utf-8');
        }
        
        // Mock parsing return for binary files (e.g. PDFs)
        return `Parsed content mock details for document file ${filePath}. This contains standard enterprise data chunks.`;
      }
      return '';
    } catch (error: any) {
      logger.error(`Error parsing document: ${error.message}`);
      return '';
    }
  },
};
