import fs from 'fs';
import { logger } from '../config/logger';

export const storageService = {
  deleteFile: async (filePath: string): Promise<boolean> => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info(`Successfully deleted file at ${filePath}`);
        return true;
      }
      return false;
    } catch (error: any) {
      logger.error(`Error deleting file ${filePath}: ${error.message}`);
      return false;
    }
  },
};
