import { Request, Response } from 'express';
import { documentService } from './document.service';
import { uploadService } from './upload.service';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { Document } from '../../models/Document';
import { uploadToCloudinary } from '../../config/multer';
import { logger } from '../../config/logger';

export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.parsedFile) {
    throw new ApiError(400, 'No file uploaded');
  }

  const { filename, mimetype, buffer, size } = req.parsedFile;

  // 1. Upload file buffer to Cloudinary
  const cloudResult = await uploadToCloudinary(buffer, filename);

  // 2. Create document record (Processing status)
  const doc = await Document.create({
    userId: req.user.id,
    fileName: cloudResult.public_id.split('/').pop() || filename,
    originalName: filename,
    fileType: mimetype,
    fileSize: size,
    storagePath: cloudResult.secure_url,
    cloudinaryPublicId: cloudResult.public_id,
    status: 'Processing',
  });

  // 3. Process document in background (extract text -> chunk -> embeddings -> vector DB -> summary)
  documentService.processDocument(doc.id).catch((err: any) => {
    logger.error(`Background processing failed for document ${doc.id}: ${err.message}`);
  });

  return sendSuccess(res, 'Document uploaded. Background processing started...', doc, 201);
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

export const toggleStarDocument = asyncHandler(async (req: Request, res: Response) => {
  const doc = await Document.findOne({ _id: req.params.id, userId: req.user.id });
  if (!doc) {
    throw new ApiError(404, 'Document not found or access denied');
  }
  doc.isStarred = !doc.isStarred;
  await doc.save();
  return sendSuccess(res, doc.isStarred ? 'Document starred' : 'Document unstarred', doc);
});

export const auditDocumentController = asyncHandler(async (req: Request, res: Response) => {
  const result = await documentService.auditDocument(req.params.id, req.user.id);
  return sendSuccess(res, 'Document audit report generated successfully', result);
});

export const createUrlDocumentController = asyncHandler(async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string' || !url.trim()) {
    throw new ApiError(400, 'Valid URL is required');
  }

  const doc = await documentService.createDocumentFromUrl(url.trim(), req.user.id);
  return sendSuccess(res, 'URL document added. Background transcript/web processing started...', doc, 201);
});
