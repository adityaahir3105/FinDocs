import { config } from '../config';

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 100);
}

export function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'application/pdf': '.pdf',
  };
  return mimeToExt[mimeType] || '';
}

export function isValidMimeType(mimeType: string): boolean {
  return config.storage.allowedMimeTypes.includes(mimeType);
}

export function validateFileSize(size: number): boolean {
  return size <= config.storage.maxFileSize;
}

export function validateFileContent(buffer: Buffer, declaredMimeType: string): boolean {
  if (buffer.length < 4) return false;

  const signatures: Record<string, number[][]> = {
    'image/jpeg': [[0xFF, 0xD8, 0xFF]],
    'image/png': [[0x89, 0x50, 0x4E, 0x47]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  };

  const expectedSignatures = signatures[declaredMimeType];
  if (!expectedSignatures) return false;

  return expectedSignatures.some((sig) =>
    sig.every((byte, index) => buffer[index] === byte)
  );
}

export function generateDocumentFilename(docType: string, mimeType: string): string {
  const ext = getFileExtension(mimeType);
  const docNames: Record<string, string> = {
    aadhaar: 'Aadhaar',
    pan: 'PAN',
    rc: 'RC',
    invoice: 'Invoice',
    insurance: 'Insurance',
  };
  return `${docNames[docType] || docType}${ext}`;
}
