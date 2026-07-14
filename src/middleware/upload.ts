import { Request, Response, NextFunction } from 'express';
import Busboy from 'busboy';
import { validateFileType } from '../config/multer';

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
        res.status(400).json({
          success: false,
          message: `File exceeds the ${MAX_FILE_SIZE / (1024 * 1024)} MB size limit.`,
        });
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
    });
  });

  busboy.on('finish', () => {
    if (!fileReceived) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }
    // Only call next if we haven't already sent a response
    if (!res.headersSent) {
      next();
    }
  });

  busboy.on('error', (err: Error) => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: `Upload error: ${err.message}` });
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
  ];

  busboy.on('file', (fieldname, fileStream, info) => {
    const { filename, mimeType } = info;
    fileReceived = true;

    // Validate mime type
    if (!allowedChatMimeTypes.includes(mimeType)) {
      fileStream.resume(); // drain the stream
      res.status(400).json({
        success: false,
        message: 'Invalid file type. Only PDF, Word, TXT, and images (JPEG, PNG, GIF, WEBP) are allowed.',
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
        res.status(400).json({
          success: false,
          message: `File exceeds the ${MAX_FILE_SIZE / (1024 * 1024)} MB size limit.`,
        });
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
    });
  });

  busboy.on('finish', () => {
    if (!fileReceived) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }
    // Only call next if we haven't already sent a response
    if (!res.headersSent) {
      next();
    }
  });

  busboy.on('error', (err: Error) => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: `Upload error: ${err.message}` });
    }
  });

  req.pipe(busboy);
};
