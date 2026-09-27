import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import authRoutes from './routes/auth';
import submitRoutes from './routes/submit';
import consignmentRoutes from './routes/consignments';

const app = express();

// Trust reverse proxy (Render, Cloudflare, etc.) so Express correctly identifies client IPs from X-Forwarded-For
app.set('trust proxy', 1);

app.use(helmet());

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://fin-docs-hazel.vercel.app'
  ],
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

const submitLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.submitMax,
  message: { success: false, message: 'Too many submissions, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

const extractLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.extractMax,
  message: { success: false, message: 'Too many photos read, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

app.use(generalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/submit', submitLimiter, submitRoutes);
app.use('/api/consignments/extract', extractLimiter);
app.use('/api/consignments', consignmentRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
});

if (!config.google.clientId) {
  console.error('ERROR: GOOGLE_CLIENT_ID is not set');
  process.exit(1);
}
if (!config.google.clientSecret) {
  console.error('ERROR: GOOGLE_CLIENT_SECRET is not set');
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Google Client ID: ${config.google.clientId.substring(0, 20)}...`);
  console.log(`Google Client Secret: ${config.google.clientSecret ? 'SET' : 'NOT SET'}`);
  console.log(`Google Redirect URI: ${config.google.redirectUri}`);
  console.log(`Storage: Google Drive (user OAuth with refresh tokens)`);
  const readers = config.consignments.readers.map((r) => (r === 'claude' ? config.anthropic.model : config.gemini.model));
  console.log(`Consignment readers: ${readers.join(' + ')}`);
  if (config.consignments.readers.includes('claude') && !config.anthropic.apiKey) {
    console.warn('WARNING: ANTHROPIC_API_KEY is not set; consignment extraction will fail');
  }
  if (config.consignments.readers.includes('gemini') && !config.gemini.project) {
    console.warn('WARNING: GOOGLE_CLOUD_PROJECT is not set; consignment extraction will fail');
  }
});
