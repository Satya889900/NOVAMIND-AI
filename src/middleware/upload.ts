import { Request, Response, NextFunction } from 'express';
import Busboy from 'busboy';
import { validateFileType } from '../config/multer';
import { logger } from '../config/logger';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Parsed file info attached to req.parsedFile by the middleware.
 */
export interface ParsedFile {
  fieldname: string;
  filename: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      parsedFile?: ParsedFile;
    }
  }
}

/**
 * Middleware to parse a single file upload from multipart/form-data
 * using busboy (no multer). The parsed file is attached to req.parsedFile.
 */
export const parseSingleFile = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.headers['content-type']?.includes('multipart/form-data')) {
    res.status(400).json({ success: false, message: 'Content-Type must be multipart/form-data' });
    return;
  }

  // Handle request level errors to prevent ECONNRESET/abrupt client closures from crashing process
  req.on('error', (err: any) => {
    logger.error(`Request socket error: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: `Request error: ${err.message}` });
    }
  });

  const busboy = Busboy({
    headers: req.headers,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  });

  let fileReceived = false;
  let fileTruncated = false;

  busboy.on('file', (fieldname, fileStream, info) => {
    const { filename, mimeType } = info;
    fileReceived = true;

    // Validate mime type
    if (!validateFileType(mimeType)) {
      fileStream.resume(); // drain the stream
      res.status(400).json({
        success: false,
        message: 'Invalid file type. Only PDF, Word, and TXT files are allowed.',
      });
      return;
    }

    const chunks: Buffer[] = [];

    fileStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    fileStream.on('limit', () => {
      fileTruncated = true;
    });

    fileStream.on('end', () => {
      if (fileTruncated) {
        if (!res.headersSent) {
          res.status(400).json({
            success: false,
            message: `File exceeds the ${MAX_FILE_SIZE / (1024 * 1024)} MB size limit.`,
          });
        }
        return;
      }

      const buffer = Buffer.concat(chunks);

      req.parsedFile = {
        fieldname,
        filename,
        mimetype: mimeType,
        buffer,
        size: buffer.length,
      };

      // Call next() strictly after the file buffer has been fully concatenated and populated
      if (!res.headersSent) {
        next();
      }
    });
  });

  busboy.on('finish', () => {
    if (!fileReceived && !res.headersSent) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
    }
  });

  busboy.on('error', (err: Error) => {
    logger.error(`Busboy parsing error: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: `Upload parsing error: ${err.message}` });
    }
  });

  req.pipe(busboy);
};

/**
 * Middleware to parse images and files for chat attachments (no multer).
 * Allows PDF, Word, TXT, and images (JPEG, PNG, GIF, WEBP).
 */
export const parseChatFile = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.headers['content-type']?.includes('multipart/form-data')) {
    res.status(400).json({ success: false, message: 'Content-Type must be multipart/form-data' });
    return;
  }

  // Handle request level errors to prevent ECONNRESET/abrupt client closures from crashing process
  req.on('error', (err: any) => {
    logger.error(`Request socket error in chat upload: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: `Request error: ${err.message}` });
    }
  });

  const busboy = Busboy({
    headers: req.headers,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  });

  let fileReceived = false;
  let fileTruncated = false;

  const allowedChatMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'audio/webm',
    'audio/wav',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'audio/x-m4a',
    'audio/amr',
  ];

  busboy.on('file', (fieldname, fileStream, info) => {
    const { filename, mimeType } = info;
    fileReceived = true;

    // Clean mimetype by stripping parameters like codecs (e.g., audio/webm;codecs=opus -> audio/webm)
    const cleanMimeType = mimeType.split(';')[0].trim().toLowerCase();

    // Validate mime type (allow listed types OR any audio/ type)
    const isAllowed = allowedChatMimeTypes.includes(cleanMimeType) || cleanMimeType.startsWith('audio/');

    if (!isAllowed) {
      fileStream.resume(); // drain the stream
      res.status(400).json({
        success: false,
        message: 'Invalid file type. Only PDF, Word, TXT, images (JPEG, PNG, GIF, WEBP), and audio files are allowed.',
      });
      return;
    }



    const chunks: Buffer[] = [];

    fileStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    fileStream.on('limit', () => {
      fileTruncated = true;
    });

    fileStream.on('end', () => {
      if (fileTruncated) {
        if (!res.headersSent) {
          res.status(400).json({
            success: false,
            message: `File exceeds the ${MAX_FILE_SIZE / (1024 * 1024)} MB size limit.`,
          });
        }
        return;
      }

      const buffer = Buffer.concat(chunks);

      req.parsedFile = {
        fieldname,
        filename,
        mimetype: mimeType,
        buffer,
        size: buffer.length,
      };

      // Call next() strictly after the file buffer has been fully concatenated and populated
      if (!res.headersSent) {
        next();
      }
    });
  });

  busboy.on('finish', () => {
    if (!fileReceived && !res.headersSent) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
    }
  });

  busboy.on('error', (err: Error) => {
    logger.error(`Busboy chat parsing error: ${err.message}`);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: `Upload parsing error: ${err.message}` });
    }
  });

  req.pipe(busboy);
};
