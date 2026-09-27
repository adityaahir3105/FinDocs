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

// Attach Authorization header if token is stored (resolves Safari / iOS third-party cookie blocking)
api.interceptors.request.use((reqConfig) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  if (token) {
    reqConfig.headers = reqConfig.headers || {};
    reqConfig.headers.Authorization = `Bearer ${token}`;
  }
  return reqConfig;
});

// Capture refreshed tokens or clear on 401
api.interceptors.response.use(
  (response) => {
    const newToken = response.headers?.['x-new-token'];
    if (newToken && typeof window !== 'undefined') {
      localStorage.setItem('auth_token', newToken);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
    return Promise.reject(error);
  }
);

export async function googleLogin(code: string): Promise<{ success: boolean; user?: User; token?: string; message?: string }> {
  const response = await api.post('/auth/google', { code });
  if (response.data?.token && typeof window !== 'undefined') {
    localStorage.setItem('auth_token', response.data.token);
  }
  return response.data;
}

export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout');
  } finally {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }
}

export async function checkAuth(): Promise<{ authenticated: boolean; user?: User }> {
  try {
    const response = await api.get('/auth/check');
    if (!response.data?.authenticated && typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
    return response.data;
  } catch (error) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
    return { authenticated: false };
  }
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
