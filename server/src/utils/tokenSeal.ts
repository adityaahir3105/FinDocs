import crypto from 'crypto';
import { config } from '../config';

/**
 * Encrypts the user's Google tokens before they go into the session JWT.
 * A JWT is only signed, not encrypted, and the session token is also kept
 * in browser storage (for Safari), so without this anyone who could read it
 * would get a long-lived Google refresh token.
 */

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
}

const key = crypto.createHash('sha256').update(`findocs:google-tokens:${config.jwt.secret}`).digest();

export function sealGoogleTokens(tokens: GoogleTokens): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
}

export function openGoogleTokens(sealed: unknown): GoogleTokens | null {
  if (typeof sealed !== 'string') return null;
  try {
    const raw = Buffer.from(sealed, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    const tokens = JSON.parse(json);
    return typeof tokens.accessToken === 'string' && typeof tokens.refreshToken === 'string' ? tokens : null;
  } catch {
    return null;
  }
}
