import { StorageProvider } from '../types';

export abstract class BaseStorageProvider implements StorageProvider {
  abstract name: string;
  
  abstract createFolder(folderName: string): Promise<{ folderId: string; folderLink: string }>;
  
  abstract uploadFile(
    folderId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<{ fileId: string; fileLink: string }>;
}
