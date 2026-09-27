import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { BaseStorageProvider } from './StorageProvider';
import { config } from '../config';

export interface SubmissionSummary {
  submissionId: string;
  folderName: string;
  folderId: string;
  folderLink: string;
  createdTime: string;
}

export class GoogleDriveProvider extends BaseStorageProvider {
  name = 'google-drive';
  private drive: drive_v3.Drive;
  private oauth2Client;

  constructor(
    private accessToken: string,
    private refreshToken?: string
  ) {
    super();

    this.oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    this.oauth2Client.on('tokens', (tokens) => {
      if (tokens.access_token) {
        this.accessToken = tokens.access_token;
      }
    });

    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  async createFolder(folderName: string): Promise<{ folderId: string; folderLink: string }> {
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: {
        createdBy: 'FinDocs',
        type: 'submission',
      },
    };

    const response = await this.drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, webViewLink',
    });

    const folderId = response.data.id!;
    const folderLink = response.data.webViewLink || `https://drive.google.com/drive/folders/${folderId}`;

    return { folderId, folderLink };
  }

  async uploadFile(
    folderId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<{ fileId: string; fileLink: string }> {
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    const media = {
      mimeType,
      body: Readable.from(buffer),
    };

    const response = await this.drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: 'id, webViewLink',
    });

    const fileId = response.data.id!;
    const fileLink = response.data.webViewLink || `https://drive.google.com/file/d/${fileId}`;

    return { fileId, fileLink };
  }

  async uploadJson(
    folderId: string,
    fileName: string,
    data: object
  ): Promise<{ fileId: string; fileLink: string }> {
    const jsonString = JSON.stringify(data, null, 2);
    const buffer = Buffer.from(jsonString, 'utf-8');

    return this.uploadFile(folderId, fileName, 'application/json', buffer);
  }

  async listSubmissions(): Promise<SubmissionSummary[]> {
    try {
      const response = await this.drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and appProperties has { key='createdBy' and value='FinDocs' } and trashed=false",
        fields: 'files(id, name, webViewLink, createdTime, appProperties)',
        orderBy: 'createdTime desc',
        pageSize: 100,
      });

      const files = response.data.files || [];

      return files.map((file) => {
        const nameParts = file.name?.split('_') || [];
        const submissionId = nameParts[nameParts.length - 1] || file.id || '';

        return {
          submissionId,
          folderName: file.name || '',
          folderId: file.id || '',
          folderLink: file.webViewLink || `https://drive.google.com/drive/folders/${file.id}`,
          createdTime: file.createdTime || '',
        };
      });
    } catch (error) {
      console.error('Failed to list submissions:', error);
      return [];
    }
  }

  /** Finds a file this app created, tagged with appProperties.type. drive.file scope only sees app-created files. */
  async findAppFile(type: string): Promise<{ fileId: string; fileLink: string } | null> {
    const response = await this.drive.files.list({
      q: `appProperties has { key='createdBy' and value='FinDocs' } and appProperties has { key='type' and value='${type}' } and trashed=false`,
      fields: 'files(id, webViewLink)',
      orderBy: 'createdTime',
      pageSize: 1,
    });
    const file = response.data.files?.[0];
    if (!file?.id) return null;
    return { fileId: file.id, fileLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}` };
  }

  async createAppFile(
    type: string,
    name: string,
    mimeType: string,
    buffer?: Buffer,
    parentId?: string
  ): Promise<{ fileId: string; fileLink: string }> {
    const response = await this.drive.files.create({
      requestBody: {
        name,
        mimeType,
        parents: parentId ? [parentId] : undefined,
        appProperties: { createdBy: 'FinDocs', type },
      },
      media: buffer ? { mimeType, body: Readable.from(buffer) } : undefined,
      fields: 'id, webViewLink',
    });
    const fileId = response.data.id!;
    return { fileId, fileLink: response.data.webViewLink || `https://drive.google.com/file/d/${fileId}` };
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const response = await this.drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return Buffer.from(response.data as ArrayBuffer);
  }

  async updateFileContent(fileId: string, mimeType: string, buffer: Buffer): Promise<void> {
    await this.drive.files.update({
      fileId,
      media: { mimeType, body: Readable.from(buffer) },
    });
  }
}
