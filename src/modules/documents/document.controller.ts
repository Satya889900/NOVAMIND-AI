import { Request, Response } from 'express';
import { documentService } from './document.service';
import { uploadService } from './upload.service';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { Document } from '../../models/Document';

export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No file uploaded');
  }

  const doc = await Document.create({
    name: req.file.originalname,
    filePath: req.file.path,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
    userId: req.user.id,
  });

  return sendSuccess(res, 'Document uploaded successfully', doc, 21);
});

export const getDocuments = asyncHandler(async (req: Request, res: Response) => {
  const docs = await uploadService.getDocumentsByUser(req.user.id);
  return sendSuccess(res, 'Documents list retrieved successfully', docs);
});

export const parseDocument = asyncHandler(async (req: Request, res: Response) => {
  const { documentId, chunkSize, chunkOverlap } = req.body;
  const result = await documentService.processDocument(documentId, chunkSize, chunkOverlap);
  return sendSuccess(res, 'Document text extracted and vectorized successfully', result);
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  await uploadService.deleteDocumentMetadata(req.params.id);
  return sendSuccess(res, 'Document deleted successfully', null);
});
