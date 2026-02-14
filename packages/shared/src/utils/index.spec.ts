import { describe, it, expect } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  extractKeyPrefix,
  generateId,
  secureCompare,
  signWebhookPayload,
  generateWebhookSecret,
} from './index';

describe('generateApiKey', () => {
  it('returns key with correct default prefix', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^sk_/);
    expect(key.length).toBeGreaterThan(10);
  });

  it('returns key with custom prefix', () => {
    const key = generateApiKey('live');
    expect(key).toMatch(/^live_/);
    expect(key.length).toBeGreaterThan(10);
  });
});

describe('hashApiKey', () => {
  it('returns consistent SHA-256 hex', () => {
    const key = 'sk_test123abc';
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);

    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns different hashes for different keys', () => {
    const hash1 = hashApiKey('sk_key_one');
    const hash2 = hashApiKey('sk_key_two');

    expect(hash1).not.toBe(hash2);
  });
});

describe('extractKeyPrefix', () => {
  it('returns truncated prefix', () => {
    const key = 'sk_abcdefghijklmnop';
    const prefix = extractKeyPrefix(key);

    // extractKeyPrefix takes first 12 chars + "..."
    expect(prefix).toBe('sk_abcdefghi...');
    expect(prefix.endsWith('...')).toBe(true);
    expect(prefix.length).toBe(15);
  });
});

describe('generateId', () => {
  it('returns ID with correct prefix', () => {
    const id = generateId('key');
    expect(id).toMatch(/^key_/);
    expect(id.length).toBeGreaterThan(4);
  });

  it('generates unique IDs', () => {
    const id1 = generateId('ws');
    const id2 = generateId('ws');
    expect(id1).not.toBe(id2);
  });
});

describe('secureCompare', () => {
  it('returns true for equal strings', () => {
    expect(secureCompare('hello', 'hello')).toBe(true);
    expect(secureCompare('', '')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(secureCompare('hello', 'world')).toBe(false);
  });

  it('returns false for different length strings', () => {
    expect(secureCompare('short', 'a much longer string')).toBe(false);
    expect(secureCompare('abc', 'ab')).toBe(false);
  });
});

describe('signWebhookPayload', () => {
  it('returns consistent HMAC', () => {
    const payload = '{"event":"key.created"}';
    const secret = 'whsec_testsecret';

    const sig1 = signWebhookPayload(payload, secret);
    const sig2 = signWebhookPayload(payload, secret);

    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns different signatures for different payloads', () => {
    const secret = 'whsec_testsecret';
    const sig1 = signWebhookPayload('payload_a', secret);
    const sig2 = signWebhookPayload('payload_b', secret);
    expect(sig1).not.toBe(sig2);
  });
});

describe('generateWebhookSecret', () => {
  it('starts with whsec_', () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^whsec_/);
    expect(secret.length).toBeGreaterThan(10);
  });

  it('generates unique secrets', () => {
    const s1 = generateWebhookSecret();
    const s2 = generateWebhookSecret();
    expect(s1).not.toBe(s2);
  });
});
