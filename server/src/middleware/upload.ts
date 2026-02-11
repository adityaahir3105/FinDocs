import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { isValidMimeType } from '../utils/fileUtils';

const storage = multer.memoryStorage();

const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (!isValidMimeType(file.mimetype)) {
    cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPG, PNG, PDF`));
    return;
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.storage.maxFileSize,
    files: 5,
  },
});

export const uploadFields = upload.fields([
  { name: 'aadhaar', maxCount: 1 },
  { name: 'pan', maxCount: 1 },
  { name: 'rc', maxCount: 1 },
  { name: 'invoice', maxCount: 1 },
  { name: 'insurance', maxCount: 1 },
]);

export function handleMulterError(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.',
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  
  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  
  next();
}
