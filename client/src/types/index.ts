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

// Consignment reader
export type FieldKind = 'text' | 'date' | 'weight' | 'amount' | 'truck';

export interface ConsignmentFieldDef {
  key: string;
  label: string;
  section: 'lr' | 'gp';
  kind: FieldKind;
  required?: boolean;
}

export interface ConsignmentIssue {
  id: string;
  severity: 'error' | 'warning';
  fields: string[];
  message: string;
}

export interface ConsignmentFieldResult {
  value: string;
  raw: string | null;
  confidence: 'high' | 'medium' | 'low';
  alternatives: string[];
}

export interface ConsignmentExtraction {
  fields: Record<string, ConsignmentFieldResult>;
  documents: { lorryReceipt: boolean; gatePass: boolean };
  readingNotes: string[];
  passes: number;
  /** Model used for each reading, in order. */
  readers: string[];
  reviewIssues: ConsignmentIssue[];
  issues: ConsignmentIssue[];
}

export interface ConsignmentAppendResult {
  rowNumber: number;
  workbookLink: string;
  sourcePhotoLink?: string;
}
