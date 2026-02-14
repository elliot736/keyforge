import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

// Generate a cryptographically secure API key
export function generateApiKey(prefix = 'sk'): string {
  const bytes = randomBytes(32);
  const key = bytes.toString('base64url');
  return `${prefix}_${key}`;
}

// SHA-256 hash of an API key
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// Extract the display prefix from a raw key (prefix + first 8 chars of random part)
export function extractKeyPrefix(key: string): string {
  return key.substring(0, Math.min(key.length, 12)) + '...';
}

// Generate a prefixed ID using nanoid-style approach
export function generateId(prefix: string): string {
  const bytes = randomBytes(16);
  const id = bytes.toString('base64url').replace(/[_-]/g, '').substring(0, 20);
  return `${prefix}_${id}`;
}

// Constant-time string comparison
export function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against itself to take constant time, then return false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// Generate HMAC-SHA256 signature for webhook payloads
export function signWebhookPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

// Generate webhook signing secret
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}
