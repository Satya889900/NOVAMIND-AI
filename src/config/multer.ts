import { cloudinary } from '../config/cloudinary';
import { Readable } from 'stream';
import { logger } from '../config/logger';

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  bytes: number;
  format: string;
  resource_type: string;
  original_filename: string;
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

/**
 * Upload a file buffer to Cloudinary using the auto resource_type
 * (auto dynamically detects PDFs, docs, txt, and images).
 */
export const uploadToCloudinary = (
  fileBuffer: Buffer,
  originalName: string,
  folder = 'novamind/documents'
): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder,
        public_id: `${Date.now()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
        use_filename: true,
        unique_filename: true,
      },
      (error, result) => {
        if (error) {
          logger.error(`Cloudinary upload failed: ${error.message}`);
          return reject(error);
        }
        if (!result) {
          return reject(new Error('Cloudinary returned no result'));
        }
        resolve({
          public_id: result.public_id,
          secure_url: result.secure_url,
          bytes: result.bytes,
          format: result.format,
          resource_type: result.resource_type,
          original_filename: result.original_filename,
        });
      }
    );

    // Pipe the buffer into the upload stream
    const readable = Readable.from(fileBuffer);
    readable.pipe(uploadStream);
  });
};

/**
 * Delete a file from Cloudinary by its public_id.
 */
export const deleteFromCloudinary = async (publicId: string, resourceType = 'raw'): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    logger.info(`Deleted from Cloudinary: ${publicId} (${resourceType})`);
  } catch (err: any) {
    logger.error(`Failed to delete from Cloudinary: ${err.message}`);
  }
};

/**
 * Validate a file's MIME type.
 */
export const validateFileType = (mimeType: string): boolean => {
  return ALLOWED_MIME_TYPES.includes(mimeType);
};
