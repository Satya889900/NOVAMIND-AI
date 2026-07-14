import { Request, Response } from 'express';
import { documentService } from './document.service';
import { uploadService } from './upload.service';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { Document } from '../../models/Document';
import { uploadToCloudinary } from '../../config/multer';

export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.parsedFile) {
    throw new ApiError(400, 'No file uploaded');
  }

  const { filename, mimetype, buffer, size } = req.parsedFile;

  // 1. Upload file buffer to Cloudinary
  const cloudResult = await uploadToCloudinary(buffer, filename);

  // 2. Create document record (Uploaded status)
  const doc = await Document.create({
    userId: req.user.id,
    fileName: cloudResult.public_id.split('/').pop() || filename,
    originalName: filename,
    fileType: mimetype,
    fileSize: size,
    storagePath: cloudResult.secure_url,
    cloudinaryPublicId: cloudResult.public_id,
    status: 'Uploaded',
  });

  // 3. Process document (Extract text -> chunk -> store)
  const result = await documentService.processDocument(doc.id);

  return sendSuccess(res, 'Document uploaded and processed successfully', result.document, 201);
});

export const getDocuments = asyncHandler(async (req: Request, res: Response) => {
  const docs = await uploadService.getDocumentsByUser(req.user.id);
  return sendSuccess(res, 'Documents list retrieved successfully', docs);
});

export const getDocumentById = asyncHandler(async (req: Request, res: Response) => {
  const doc = await uploadService.getDocumentById(req.params.id, req.user.id);
  if (!doc) {
    throw new ApiError(404, 'Document not found or access denied');
  }
  return sendSuccess(res, 'Document retrieved successfully', doc);
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const result = await uploadService.deleteDocument(req.params.id, req.user.id);
  return sendSuccess(res, 'Document deleted successfully', result);
});
