import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { submissionSchema, documentTypes } from '../validation/schemas';
import { uploadFields, handleMulterError } from '../middleware/upload';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getStorageProvider, GoogleDriveProvider } from '../storage';
import { generateDocumentFilename, isValidMimeType, validateFileSize, validateFileContent } from '../utils/fileUtils';
import { config } from '../config';

const router = Router();

interface MulterFiles {
  [fieldname: string]: Express.Multer.File[];
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function sanitizeFolderName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}

router.post(
  '/',
  authenticate,
  uploadFields,
  handleMulterError,
  async (req: AuthRequest, res: Response) => {
    try {
      const result = submissionSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          errors: result.error.flatten().fieldErrors,
        });
      }

      const { customerName, mobileNumber, vehicleNumber, bankName } = result.data;
      const files = (req.files as MulterFiles) || {};

      // Validate uploaded files (documents are optional)
      let totalSize = 0;
      const uploadedDocTypes: string[] = [];

      for (const docType of documentTypes) {
        const file = files[docType]?.[0];
        if (!file) continue;

        uploadedDocTypes.push(docType);
        totalSize += file.size;

        if (!isValidMimeType(file.mimetype)) {
          return res.status(400).json({
            success: false,
            message: `Invalid file type for ${docType}: ${file.mimetype}`,
          });
        }

        if (!validateFileSize(file.size)) {
          return res.status(400).json({
            success: false,
            message: `File too large for ${docType}. Maximum size is 5MB.`,
          });
        }

        if (!validateFileContent(file.buffer, file.mimetype)) {
          console.warn(`Suspicious file upload attempt for ${docType} from user ${req.userId}`);
          return res.status(400).json({
            success: false,
            message: `Invalid file content for ${docType}. File signature does not match declared type.`,
          });
        }
      }

      if (totalSize > config.storage.maxTotalSize) {
        return res.status(400).json({
          success: false,
          message: `Total upload size exceeds ${config.storage.maxTotalSize / (1024 * 1024)}MB limit.`,
        });
      }

      const submissionId = uuidv4().substring(0, 8).toUpperCase();
      const timestamp = new Date();
      const dateStr = formatDate(timestamp);
      const sanitizedCustomerName = sanitizeFolderName(customerName);
      const sanitizedVehicleNumber = vehicleNumber.replace(/[^a-zA-Z0-9]/g, '');
      const folderName = `${sanitizedCustomerName}_${sanitizedVehicleNumber}_${dateStr}_${submissionId}`;

      const storageProvider = getStorageProvider(req.accessToken, req.refreshToken);

      const { folderId, folderLink } = await storageProvider.createFolder(folderName);

      const uploadedFiles: string[] = [];

      // Only upload files that were provided
      for (const docType of documentTypes) {
        const file = files[docType]?.[0];
        if (!file) continue;

        const fileName = generateDocumentFilename(docType, file.mimetype);
        await storageProvider.uploadFile(folderId, fileName, file.mimetype, file.buffer);
        uploadedFiles.push(fileName);
      }

      const submissionMetadata = {
        submissionId,
        customerName,
        mobileNumber,
        vehicleNumber,
        bankName,
        timestamp: timestamp.toISOString(),
        uploadedFiles,
        documentsUploaded: uploadedDocTypes,
        userEmail: req.userEmail,
      };

      if (storageProvider instanceof GoogleDriveProvider) {
        await storageProvider.uploadJson(folderId, 'submission.json', submissionMetadata);
      }

      console.log(`Submission ${submissionId} completed for user ${req.userEmail} with ${uploadedFiles.length} documents`);

      return res.json({
        success: true,
        data: {
          submissionId,
          folderLink,
          uploadedFiles,
          customerName,
          vehicleNumber,
          bankName,
          timestamp: timestamp.toISOString(),
        },
      });
    } catch (error) {
      console.error('Submission error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to process submission. Please try again.',
      });
    }
  }
);

router.get('/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const storageProvider = getStorageProvider(req.accessToken, req.refreshToken);

    if (!(storageProvider instanceof GoogleDriveProvider)) {
      return res.status(400).json({
        success: false,
        message: 'Submission history only available with Google Drive storage',
      });
    }

    const submissions = await storageProvider.listSubmissions();

    return res.json({
      success: true,
      data: submissions,
    });
  } catch (error) {
    console.error('Failed to fetch submission history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch submission history',
    });
  }
});

export default router;
