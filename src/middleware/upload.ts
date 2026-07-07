import { upload } from '../config/multer';

export const uploadSingle = upload.single('file');
export const uploadMultiple = upload.array('files', 5);
export const uploadAvatar = upload.single('avatar');
