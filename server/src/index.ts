import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import authRoutes from './routes/auth';
import submitRoutes from './routes/submit';

const app = express();

app.use(helmet());

app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const submitLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.submitMax,
  message: { success: false, message: 'Too many submissions, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/submit', submitLimiter, submitRoutes);

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
});
