import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { config } from '../config';

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
}

interface TokenPayload {
  userId: string;
  email: string;
  name?: string;
  picture?: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
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

    const jwtPayload: TokenPayload = {
      userId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name || undefined,
      picture: userInfo.picture || undefined,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || '',
      tokenExpiry,
    };

    const token = jwt.sign(jwtPayload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
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
  res.clearCookie('token');
  return res.json({ success: true });
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;

    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

    if (decoded.tokenExpiry - now < bufferTime) {
      console.log('Access token expired or expiring soon, refreshing...');
      
      const newTokens = await refreshAccessToken(decoded.refreshToken);
      
      if (newTokens) {
        const newPayload: TokenPayload = {
          ...decoded,
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken,
          tokenExpiry: newTokens.tokenExpiry,
        };

        const newJwt = jwt.sign(newPayload, config.jwt.secret, {
          expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
        });

        res.cookie('token', newJwt, {
          httpOnly: true,
          secure: config.nodeEnv === 'production',
          sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        req.accessToken = newTokens.accessToken;
        req.refreshToken = newTokens.refreshToken;
        req.tokenExpiry = newTokens.tokenExpiry;
      } else {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please login again.',
        });
      }
    } else {
      req.accessToken = decoded.accessToken;
      req.refreshToken = decoded.refreshToken;
      req.tokenExpiry = decoded.tokenExpiry;
    }

    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
}

export function checkAuth(req: AuthRequest, res: Response) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
    return res.json({
      authenticated: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
      },
    });
  } catch (error) {
    return res.json({ authenticated: false });
  }
}
