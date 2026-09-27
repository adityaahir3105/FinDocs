import axios from 'axios';
import {
  ApiResponse,
  SubmissionResult,
  User,
  SubmissionSummary,
  ConsignmentFieldDef,
  ConsignmentExtraction,
  ConsignmentIssue,
  ConsignmentAppendResult,
} from '../types';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'}/api`,
  withCredentials: true,
});

export async function googleLogin(code: string): Promise<{ success: boolean; user?: User; message?: string }> {
  const response = await api.post('/auth/google', { code });
  return response.data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function checkAuth(): Promise<{ authenticated: boolean; user?: User }> {
  const response = await api.get('/auth/check');
  return response.data;
}

export async function getSubmissionHistory(): Promise<{ success: boolean; data?: SubmissionSummary[]; message?: string }> {
  const response = await api.get('/submit/history');
  return response.data;
}

export async function submitForm(
  formData: FormData,
  onProgress?: (progress: number) => void
): Promise<ApiResponse<SubmissionResult>> {
  const response = await api.post('/submit', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(progress);
      }
    },
  });
  return response.data;
}

export async function getConsignmentFields(): Promise<ApiResponse<ConsignmentFieldDef[]>> {
  const response = await api.get('/consignments/fields');
  return response.data;
}

export async function extractConsignment(image: File, rotate: number): Promise<ApiResponse<ConsignmentExtraction>> {
  const formData = new FormData();
  formData.append('image', image);
  formData.append('rotate', String(rotate));
  // Two independent AI readings run per photo; allow time for both.
  const response = await api.post('/consignments/extract', formData, { timeout: 5 * 60 * 1000 });
  return response.data;
}

export async function validateConsignment(values: Record<string, string>): Promise<ApiResponse<{ issues: ConsignmentIssue[] }>> {
  const response = await api.post('/consignments/validate', { values });
  return response.data;
}

export async function appendConsignment(
  values: Record<string, string>,
  acknowledgedIssueIds: string[],
  allowDuplicate: boolean,
  image: File | null
): Promise<ApiResponse<ConsignmentAppendResult>> {
  const formData = new FormData();
  formData.append('payload', JSON.stringify({ values, acknowledgedIssueIds, allowDuplicate }));
  if (image) formData.append('image', image);
  const response = await api.post('/consignments/append', formData);
  return response.data;
}

export async function getConsignmentWorkbookLink(): Promise<ApiResponse<{ workbookLink: string | null }>> {
  const response = await api.get('/consignments/workbook/link');
  return response.data;
}

export async function downloadConsignmentWorkbook(): Promise<Blob> {
  const response = await api.get('/consignments/workbook', { responseType: 'blob' });
  return response.data;
}

export default api;
