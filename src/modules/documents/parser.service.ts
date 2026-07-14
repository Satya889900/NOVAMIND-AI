import mammoth from 'mammoth';
import { logger } from '../../config/logger';
import https from 'https';
import http from 'http';

// pdf-parse is a CommonJS module — use require with a type cast
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = require('pdf-parse');

/**
 * Download a file from a URL and return its contents as a Buffer.
 */
function downloadFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    client.get(url, (res) => {
      // Handle redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode && res.statusCode >= 400) {
        return reject(new Error(`Failed to download file: HTTP ${res.statusCode}`));
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export const parserService = {
  /**
   * Parse a document stored at a Cloudinary URL to extract text.
   * storagePath is now a Cloudinary secure_url (https://...).
   */
  parseDocumentToText: async (storagePath: string, mimeType: string): Promise<string> => {
    logger.info(`Parsing document from ${storagePath} (${mimeType})`);
    try {
      // Download file from Cloudinary
      const fileBuffer = await downloadFile(storagePath);

      if (mimeType === 'application/pdf') {
        const data = await pdfParse(fileBuffer);
        return data.text || '';
      }

      if (
        mimeType === 'application/msword' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        return result.value || '';
      }

      if (mimeType === 'text/plain') {
        return fileBuffer.toString('utf-8');
      }

      throw new Error(`Unsupported mime type: ${mimeType}`);
    } catch (error: any) {
      logger.error(`Error parsing document ${storagePath}: ${error.message}`);
      throw error;
    }
  },
};
