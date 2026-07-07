import { Router } from 'express';
import { uploadDocument, getDocuments, parseDocument, deleteDocument } from './document.controller';
import { validate } from '../../middleware/validate';
import { parseDocumentSchema } from '../../validators/document.validator';
import { protect } from '../../middleware/auth';
import { uploadSingle } from '../../middleware/upload';

const router = Router();

router.use(protect);

router.post('/upload', uploadSingle, uploadDocument);
router.get('/', getDocuments);
router.post('/process', validate(parseDocumentSchema), parseDocument);
router.delete('/:id', deleteDocument);

export const documentRouter = router;
