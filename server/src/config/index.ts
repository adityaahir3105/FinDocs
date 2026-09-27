import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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

  consignments: {
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
