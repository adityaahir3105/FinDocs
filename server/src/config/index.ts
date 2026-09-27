import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const READER_NAMES = ['claude', 'gemini'] as const;
type ReaderName = (typeof READER_NAMES)[number];

/** CONSIGNMENT_READERS="claude,gemini" picks the model for each reading; default is N Claude readings. */
export function parseReaders(readers: string | undefined, passes: string | undefined): ReaderName[] {
  if (readers?.trim()) {
    const names = readers.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
    const invalid = names.filter((n) => !READER_NAMES.includes(n as ReaderName));
    if (invalid.length || !names.length) {
      throw new Error(`CONSIGNMENT_READERS must be a comma-separated list of ${READER_NAMES.join('/')}, got "${readers}"`);
    }
    return names as ReaderName[];
  }
  return Array(Math.max(1, parseInt(passes || '2', 10) || 2)).fill('claude');
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'postmessage',
  },
  
  storage: {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    maxTotalSize: 25 * 1024 * 1024, // 25MB total
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'application/pdf',
    ],
  },
  
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5',
    // Independent readings per photo; fields where they disagree are flagged for review.
    extractionPasses: parseInt(process.env.CONSIGNMENT_EXTRACTION_PASSES || '2', 10),
    // Server-side retry on another model if the requested one declines.
    fallbacks: process.env.ANTHROPIC_FALLBACKS !== 'off',
  },

  gemini: {
    // Vertex AI; credentials come from Application Default Credentials.
    project: process.env.GOOGLE_CLOUD_PROJECT || '',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    mediaResolution: (process.env.GEMINI_MEDIA_RESOLUTION || 'high').toLowerCase(), // high | ultra_high
    thinkingLevel: (process.env.GEMINI_THINKING_LEVEL || 'medium').toLowerCase(), // low | medium | high
  },

  consignments: {
    // Independent readings per photo; fields where they disagree are flagged.
    readers: parseReaders(process.env.CONSIGNMENT_READERS, process.env.CONSIGNMENT_EXTRACTION_PASSES),
    maxImageSize: 15 * 1024 * 1024, // 15MB (phone photos); resized before sending to the model
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    workbookName: 'FinDocs Consignments.xlsx',
    imagesFolderName: 'FinDocs Consignment Photos',
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    submitMax: 10, // stricter limit for submissions
    extractMax: 40, // each extraction is a paid AI call
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
};
