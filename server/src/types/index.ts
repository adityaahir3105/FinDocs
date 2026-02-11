export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface SubmissionData {
  customerName: string;
  mobileNumber: string;
  vehicleNumber: string;
  bankName: string;
}

export interface StorageResult {
  success: boolean;
  folderId?: string;
  folderLink?: string;
  error?: string;
}

export interface StorageProvider {
  name: string;
  createFolder(folderName: string): Promise<{ folderId: string; folderLink: string }>;
  uploadFile(
    folderId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<{ fileId: string; fileLink: string }>;
}

export interface SubmissionResult {
  submissionId: string;
  folderLink: string;
  uploadedFiles: string[];
}

export interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
}
