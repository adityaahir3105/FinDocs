import { StorageProvider } from '../types';
import { GoogleDriveProvider, SubmissionSummary } from './GoogleDriveProvider';
import { LocalStorageProvider } from './LocalStorageProvider';

export function getStorageProvider(accessToken?: string, refreshToken?: string): GoogleDriveProvider | LocalStorageProvider {
  if (accessToken) {
    return new GoogleDriveProvider(accessToken, refreshToken);
  }
  return new LocalStorageProvider();
}

export { BaseStorageProvider } from './StorageProvider';
export { GoogleDriveProvider, SubmissionSummary } from './GoogleDriveProvider';
export { LocalStorageProvider } from './LocalStorageProvider';
