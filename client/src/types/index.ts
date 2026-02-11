export interface SubmissionFormData {
  customerName: string;
  mobileNumber: string;
  vehicleNumber: string;
  bankName: string;
}

export interface DocumentFile {
  file: File | null;
  preview: string | null;
  uploading: boolean;
  progress: number;
  error: string | null;
}

export interface DocumentFiles {
  aadhaar: DocumentFile;
  pan: DocumentFile;
  rc: DocumentFile;
  invoice: DocumentFile;
  insurance: DocumentFile;
}

export type DocumentType = keyof DocumentFiles;

export interface SubmissionResult {
  submissionId: string;
  folderLink: string;
  uploadedFiles: string[];
  customerName: string;
  vehicleNumber: string;
  bankName: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  accessToken?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
}

export interface SubmissionSummary {
  submissionId: string;
  folderName: string;
  folderId: string;
  folderLink: string;
  createdTime: string;
}
