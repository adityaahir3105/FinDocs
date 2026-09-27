import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { config } from '../config';
import { sealGoogleTokens, openGoogleTokens, GoogleTokens } from '../utils/tokenSeal';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
}

interface SessionUser {
  userId: string;
  email: string;
  name?: string;
  picture?: string;
}

/** What the session JWT carries. Google tokens are sealed (encrypted), see utils/tokenSeal. */
interface TokenPayload extends SessionUser {
  google: string;
  tokenExpiry: number;
}

type Session = SessionUser & GoogleTokens & { tokenExpiry: number };

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Cross-site in production (Vercel page, Render API), so the cookie must be SameSite=None; Secure.
// Clearing it needs the same attributes, or browsers ignore the clear on cross-site responses.
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: config.nodeEnv === 'production' ? ('none' as const) : ('lax' as const),
  path: '/',
};

/** Signs a new session, sets the cookie, and returns the token (also used as a Bearer token). */
function issueSession(res: Response, session: Session): string {
  const { accessToken, refreshToken, ...rest } = session;
  const payload: TokenPayload = { ...rest, google: sealGoogleTokens({ accessToken, refreshToken }) };
  const token = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });
  res.cookie('token', token, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE_MS });
  return token;
}

/**
 * Returns the first valid session from the Authorization header or the cookie.
 * Both can be present (cookie where the browser allows it, header for Safari);
 * a stale one must not hide a valid one.
 */
function readSession(req: Request): { session: Session | null; presented: boolean } {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const candidates = [bearer, req.cookies?.token].filter((t): t is string => !!t);
  for (const token of candidates) {
    try {
      const p = jwt.verify(token, config.jwt.secret) as TokenPayload;
      const google = openGoogleTokens(p.google);
      if (!google) continue;
      return {
        session: { userId: p.userId, email: p.email, name: p.name, picture: p.picture, tokenExpiry: p.tokenExpiry, ...google },
        presented: true,
      };
    } catch {
      // try the next candidate
    }
  }
  return { session: null, presented: candidates.length > 0 };
}

function getOAuth2Client() {
  if (!config.google.clientId || !config.google.clientSecret) {
    throw new Error('Missing Google OAuth environment variables (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
  }
  
  console.log('OAuth2 Client Config:', {
    clientId: config.google.clientId.substring(0, 20) + '...',
    clientSecretSet: !!config.google.clientSecret,
    redirectUri: config.google.redirectUri,
  });

  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

export async function googleLogin(req: Request, res: Response) {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Missing authorization code',
      });
    }

    const oauth2Client = getOAuth2Client();

    let tokens;
    try {
      console.log('Attempting token exchange with code:', code.substring(0, 20) + '...');
      const { tokens: tokenResponse } = await oauth2Client.getToken(code);
      tokens = tokenResponse;
      console.log('Token exchange successful:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiryDate: tokens.expiry_date,
      });
    } catch (error: any) {
      console.error('Token exchange error:', {
        message: error.message,
        code: error.code,
        response: error.response?.data,
      });
      return res.status(400).json({
        success: false,
        message: 'Failed to exchange authorization code',
        error: error.message,
        details: error.response?.data,
      });
    }

    if (!tokens.access_token) {
      return res.status(400).json({
        success: false,
        message: 'No access token received',
      });
    }

    if (!tokens.refresh_token) {
      console.warn('No refresh token received - user may need to re-consent');
    }

    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    
    let userInfo;
    try {
      const { data } = await oauth2.userinfo.get();
      userInfo = data;
    } catch (error) {
      console.error('Failed to get user info:', error);
      return res.status(400).json({
        success: false,
        message: 'Failed to get user information',
      });
    }

    if (!userInfo.id || !userInfo.email) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user info from Google',
      });
    }

    const tokenExpiry = tokens.expiry_date || Date.now() + 3600 * 1000;

    const token = issueSession(res, {
      userId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name || undefined,
      picture: userInfo.picture || undefined,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || '',
      tokenExpiry,
    });

    return res.json({
      success: true,
      token,
      user: {
        id: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    });
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
} | null> {
  if (!refreshToken) {
    return null;
  }

  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();

    return {
      accessToken: credentials.access_token!,
      refreshToken: credentials.refresh_token || refreshToken,
      tokenExpiry: credentials.expiry_date || Date.now() + 3600 * 1000,
    };
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

export function logout(req: Request, res: Response) {
  res.clearCookie('token', COOKIE_OPTIONS);
  return res.json({ success: true });
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const { session, presented } = readSession(req);

  if (!session) {
    return res.status(401).json({
      success: false,
      message: presented ? 'Session expired. Please sign in again.' : 'Authentication required',
    });
  }

  let current = session;
  const bufferTime = 5 * 60 * 1000; // refresh the Google access token 5 minutes before it expires

  if (session.tokenExpiry - Date.now() < bufferTime) {
    const newTokens = await refreshAccessToken(session.refreshToken);
    if (!newTokens) {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please sign in again.',
      });
    }
    current = { ...session, ...newTokens };
    // Clients that cannot use the cookie (Safari) pick the new session up from this header.
    res.setHeader('x-new-token', issueSession(res, current));
  }

  req.accessToken = current.accessToken;
  req.refreshToken = current.refreshToken;
  req.tokenExpiry = current.tokenExpiry;
  req.userId = current.userId;
  req.userEmail = current.email;
  next();
}

export function checkAuth(req: AuthRequest, res: Response) {
  const { session } = readSession(req);
  if (!session) {
    return res.json({ authenticated: false });
  }
  return res.json({
    authenticated: true,
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      picture: session.picture,
    },
  });
}
