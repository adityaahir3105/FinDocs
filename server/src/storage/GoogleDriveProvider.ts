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
}
