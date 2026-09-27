import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-only-0123456789';

/* eslint-disable @typescript-eslint/no-var-requires */
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const { authenticate, checkAuth } = require('./auth');
const { sealGoogleTokens, openGoogleTokens } = require('../utils/tokenSeal');

const SECRET = process.env.JWT_SECRET;

function sessionToken(overrides: Record<string, unknown> = {}, tokens = { accessToken: 'ya29.access', refreshToken: '1//refresh' }) {
  return jwt.sign(
    { userId: 'u1', email: 'a@b.com', name: 'A', google: sealGoogleTokens(tokens), tokenExpiry: Date.now() + 3600e3, ...overrides },
    SECRET,
    { expiresIn: '7d' }
  );
}

function mockRes() {
  const res: any = { statusCode: 200, headers: {} as Record<string, string>, cookies: [] as any[] };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.cookie = (name: string, value: string, opts: unknown) => (res.cookies.push({ name, value, opts }), res);
  res.setHeader = (k: string, v: string) => (res.headers[k.toLowerCase()] = v);
  return res;
}

async function run(req: any) {
  const res = mockRes();
  let nextCalled = false;
  req.headers ??= {};
  req.cookies ??= {};
  await authenticate(req, res, () => (nextCalled = true));
  return { res, nextCalled, req };
}

test('tokenSeal: round trip, tamper and garbage are rejected', () => {
  const sealed = sealGoogleTokens({ accessToken: 'a', refreshToken: 'r' });
  assert.deepEqual(openGoogleTokens(sealed), { accessToken: 'a', refreshToken: 'r' });
  assert.ok(!sealed.includes('"a"'), 'tokens are not readable in the sealed value');
  const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA');
  assert.equal(openGoogleTokens(tampered), null);
  assert.equal(openGoogleTokens('not-base64!'), null);
  assert.equal(openGoogleTokens(undefined), null);
});

test('authenticate: accepts a valid Bearer token and exposes Google tokens', async () => {
  const req: any = { headers: { authorization: `Bearer ${sessionToken()}` } };
  const { nextCalled, res } = await run(req);
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.accessToken, 'ya29.access');
  assert.equal(req.userEmail, 'a@b.com');
});

test('authenticate: a stale cookie does not hide a valid header (and vice versa)', async () => {
  const good = sessionToken();
  for (const req of [
    { cookies: { token: 'stale.jwt.value' }, headers: { authorization: `Bearer ${good}` } },
    { cookies: { token: good }, headers: { authorization: 'Bearer stale.jwt.value' } },
  ]) {
    const { nextCalled } = await run(req);
    assert.equal(nextCalled, true);
  }
});

test('authenticate: refreshes an expiring Google token and issues a new session', async (t) => {
  // Before the fix, re-signing the decoded payload (which carries `exp`) threw, so every
  // session was rejected about an hour after sign-in.
  t.mock.method(google.auth.OAuth2.prototype, 'refreshAccessToken', async () => ({
    credentials: { access_token: 'ya29.new', expiry_date: Date.now() + 3600e3 },
  }));
  const req: any = { headers: { authorization: `Bearer ${sessionToken({ tokenExpiry: Date.now() - 1000 })}` } };
  const { nextCalled, res } = await run(req);
  assert.equal(nextCalled, true);
  assert.equal(req.accessToken, 'ya29.new');
  assert.equal(req.refreshToken, '1//refresh', 'refresh token is kept when Google does not rotate it');

  const newToken = res.headers['x-new-token'];
  assert.ok(newToken, 'new session returned for Bearer clients');
  assert.equal(res.cookies[0].value, newToken, 'and set as the cookie');
  const payload = jwt.verify(newToken, SECRET);
  assert.equal(openGoogleTokens(payload.google).accessToken, 'ya29.new');
  assert.ok(payload.exp > Date.now() / 1000 + 6 * 24 * 3600, 'session extended');
});

test('authenticate: rejects when the refresh fails, old-format tokens, and missing tokens', async (t) => {
  t.mock.method(google.auth.OAuth2.prototype, 'refreshAccessToken', async () => {
    throw new Error('invalid_grant');
  });
  const expiring = await run({ headers: { authorization: `Bearer ${sessionToken({ tokenExpiry: Date.now() - 1000 })}` } });
  assert.equal(expiring.nextCalled, false);
  assert.equal(expiring.res.statusCode, 401);
  assert.match(expiring.res.body.message, /sign in again/);

  const oldFormat = jwt.sign({ userId: 'u1', email: 'a@b.com', accessToken: 'plain', refreshToken: 'plain', tokenExpiry: Date.now() + 3600e3 }, SECRET);
  const old = await run({ headers: { authorization: `Bearer ${oldFormat}` } });
  assert.equal(old.res.statusCode, 401);

  const forged = jwt.sign({ userId: 'u1', google: sealGoogleTokens({ accessToken: 'a', refreshToken: 'r' }), tokenExpiry: Date.now() + 3600e3 }, 'wrong-secret');
  assert.equal((await run({ headers: { authorization: `Bearer ${forged}` } })).res.statusCode, 401);

  const none = await run({});
  assert.equal(none.res.statusCode, 401);
  assert.equal(none.res.body.message, 'Authentication required');
});

test('checkAuth: reports the user for a valid session only', () => {
  const ok = mockRes();
  checkAuth({ headers: { authorization: `Bearer ${sessionToken()}` }, cookies: {} }, ok);
  assert.deepEqual(ok.body, { authenticated: true, user: { id: 'u1', email: 'a@b.com', name: 'A', picture: undefined } });
  const bad = mockRes();
  checkAuth({ headers: {}, cookies: { token: 'garbage' } }, bad);
  assert.deepEqual(bad.body, { authenticated: false });
});
