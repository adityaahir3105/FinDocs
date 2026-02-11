import fs from 'fs/promises';
import path from 'path';
import { BaseStorageProvider } from './StorageProvider';

export class LocalStorageProvider extends BaseStorageProvider {
  name = 'local';
  private basePath: string;

  constructor(basePath: string = './uploads') {
    super();
    this.basePath = basePath;
  }

  async createFolder(folderName: string): Promise<{ folderId: string; folderLink: string }> {
    const folderPath = path.join(this.basePath, folderName);
    await fs.mkdir(folderPath, { recursive: true });
    
    return {
      folderId: folderPath,
      folderLink: `file://${path.resolve(folderPath)}`,
    };
  }

  async uploadFile(
    folderId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<{ fileId: string; fileLink: string }> {
    const filePath = path.join(folderId, fileName);
    await fs.writeFile(filePath, buffer);
    
    return {
      fileId: filePath,
      fileLink: `file://${path.resolve(filePath)}`,
    };
  }
}
