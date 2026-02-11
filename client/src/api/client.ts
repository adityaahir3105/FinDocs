import axios from 'axios';
import { ApiResponse, SubmissionResult, User, SubmissionSummary } from '../types';

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

export default api;
