import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

const SCRYPT_KEYLEN = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function token(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

/** Public embed key — safe to paste into a partner's HTML. */
export function publicKey() {
  return `dh_pk_${randomBytes(16).toString('hex')}`;
}

/** Partner portal key — read-only access to their own sales figures. */
export function portalKey() {
  return `dh_portal_${randomBytes(16).toString('hex')}`;
}

export function hmac(secret, payload) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
