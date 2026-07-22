import { Router } from 'express';
import {
  uploadDocument,
  getDocuments,
  getDocumentById,
  deleteDocument,
  toggleStarDocument,
  auditDocumentController,
} from '../modules/documents/document.controller';
import { protect } from '../middleware/auth';
import { parseSingleFile } from '../middleware/upload';

const router = Router();

router.use(protect);

router.post('/upload', parseSingleFile, uploadDocument);
router.get('/', getDocuments);
router.get('/:id', getDocumentById);
router.post('/:id/audit', auditDocumentController);
router.patch('/:id/star', toggleStarDocument);
router.delete('/:id', deleteDocument);

export const documentRouter = router;
