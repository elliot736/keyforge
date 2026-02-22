import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, type TestContext } from './setup';

describe('Keys endpoints (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestApp();
  });

  afterAll(async () => {
    await teardownTestApp(ctx);
  });

  // Helper to inject with auth
  function authedRequest(method: string, url: string, payload?: unknown) {
    const opts: Record<string, unknown> = {
      method,
      url,
      headers: {
        authorization: `Bearer ${ctx.rootKey}`,
      },
    };
    if (payload !== undefined) {
      opts.payload = payload;
    }
    return ctx.app.inject(opts as any);
  }

  // ── Auth guard ──────────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('POST /v1/keys.createKey returns 401 without root key', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/v1/keys.createKey',
        payload: { name: 'no-auth-key' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('GET /v1/keys returns 401 without root key', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/v1/keys',
      });
      expect(response.statusCode).toBe(401);
    });

    it('PATCH /v1/keys/fake-id returns 401 without root key', async () => {
      const response = await ctx.app.inject({
        method: 'PATCH',
        url: '/v1/keys/fake-id',
        payload: { name: 'updated' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('POST /v1/keys.revokeKey returns 401 without root key', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/v1/keys.revokeKey',
        payload: { keyId: 'fake' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('POST /v1/keys.rotateKey returns 401 without root key', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/v1/keys.rotateKey',
        payload: { keyId: 'fake' },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  // ── Create key ──────────────────────────────────────────────────────────────

  describe('POST /v1/keys.createKey', () => {
    it('creates a key and returns raw key + keyId', async () => {
      const response = await authedRequest('POST', '/v1/keys.createKey', {
        name: 'e2e-basic-key',
      });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.data).toBeDefined();
      expect(body.data.key).toBeTypeOf('string');
      expect(body.data.key.length).toBeGreaterThan(10);
      expect(body.data.keyId).toBeTypeOf('string');
      expect(body.data.keyId).toMatch(/^key_/);
    });

    it('creates a key with rate limit config', async () => {
      const response = await authedRequest('POST', '/v1/keys.createKey', {
        name: 'e2e-ratelimited-key',
        rateLimitConfig: {
          algorithm: 'fixed_window',
          limit: 100,
          window: 60000,
        },
      });

      expect(response.statusCode).toBe(200);
      const { keyId } = response.json().data;

      // Fetch the key and verify the config was stored
      const getResp = await authedRequest('GET', `/v1/keys/${keyId}`);
      expect(getResp.statusCode).toBe(200);
      const keyData = getResp.json().data;
      expect(keyData.rateLimitConfig).toBeDefined();
      expect(keyData.rateLimitConfig.limit).toBe(100);
      expect(keyData.rateLimitConfig.window).toBe(60000);
    });

    it('creates a key with tokenBudget and spendCapCents', async () => {
      const response = await authedRequest('POST', '/v1/keys.createKey', {
        name: 'e2e-budget-key',
        tokenBudget: 500000,
        spendCapCents: 1000,
      });

      expect(response.statusCode).toBe(200);
      const { keyId } = response.json().data;

      const getResp = await authedRequest('GET', `/v1/keys/${keyId}`);
      expect(getResp.statusCode).toBe(200);
      const keyData = getResp.json().data;
      expect(keyData.tokenBudget).toBe(500000);
      expect(keyData.spendCapCents).toBe(1000);
    });
  });

  // ── Verify key ──────────────────────────────────────────────────────────────

  describe('POST /v1/keys.verifyKey', () => {
    it('returns valid: true for a valid key', async () => {
      // Create a key first
      const createResp = await authedRequest('POST', '/v1/keys.createKey', {
        name: 'e2e-verify-valid',
      });
      const { key } = createResp.json().data;

      // Verify endpoint does NOT require auth
      const verifyResp = await ctx.app.inject({
        method: 'POST',
        url: '/v1/keys.verifyKey',
        payload: { key },
      });

      expect(verifyResp.statusCode).toBe(200);
      const body = verifyResp.json();
      expect(body.valid).toBe(true);
      expect(body.keyId).toBeTypeOf('string');
      expect(body.workspaceId).toBe(ctx.workspaceId);
    });

    it('returns valid: false with KEY_NOT_FOUND for invalid key', async () => {
      const verifyResp = await ctx.app.inject({
        method: 'POST',
        url: '/v1/keys.verifyKey',
        payload: { key: 'sk_this_key_does_not_exist_at_all_12345' },
      });

      expect(verifyResp.statusCode).toBe(200);
      const body = verifyResp.json();
      expect(body.valid).toBe(false);
      expect(body.code).toBe('KEY_NOT_FOUND');
    });
  });

  // ── List keys ───────────────────────────────────────────────────────────────

  describe('GET /v1/keys', () => {
    it('lists keys for the workspace', async () => {
      // Create a key so there's at least one
      await authedRequest('POST', '/v1/keys.createKey', {
        name: 'e2e-list-test',
      });

      const response = await authedRequest('GET', '/v1/keys');
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.meta).toBeDefined();
      expect(body.meta.total).toBeTypeOf('number');

      // Verify keys belong to our workspace
      for (const key of body.data) {
        expect(key.workspaceId).toBe(ctx.workspaceId);
      }
    });
  });

  // ── Get key ─────────────────────────────────────────────────────────────────

  describe('GET /v1/keys/:keyId', () => {
    it('returns key details without hash', async () => {
      const createResp = await authedRequest('POST', '/v1/keys.createKey', {
        name: 'e2e-get-detail',
        meta: { team: 'backend' },
      });
      const { keyId } = createResp.json().data;

      const response = await authedRequest('GET', `/v1/keys/${keyId}`);
      expect(response.statusCode).toBe(200);

      const keyData = response.json().data;
      expect(keyData.id).toBe(keyId);
      expect(keyData.name).toBe('e2e-get-detail');
      expect(keyData.prefix).toBeTypeOf('string');
      expect(keyData.workspaceId).toBe(ctx.workspaceId);
      expect(keyData.createdAt).toBeTypeOf('string');
      // Ensure the raw key hash is NOT returned
      expect(keyData.keyHash).toBeUndefined();
      expect(keyData.hash).toBeUndefined();
    });
  });

  // ── Update key ──────────────────────────────────────────────────────────────

  describe('PATCH /v1/keys/:keyId', () => {
    it('updates name and metadata', async () => {
      const createResp = await authedRequest('POST', '/v1/keys.createKey', {
        name: 'e2e-update-original',
      });
      const { keyId } = createResp.json().data;

      const response = await authedRequest('PATCH', `/v1/keys/${keyId}`, {
        name: 'e2e-update-renamed',
        meta: { env: 'staging', version: 2 },
      });

      expect(response.statusCode).toBe(200);
      const updated = response.json().data;
      expect(updated.name).toBe('e2e-update-renamed');
      expect(updated.meta).toEqual({ env: 'staging', version: 2 });
    });
  });

  // ── Rotate key ──────────────────────────────────────────────────────────────

  describe('POST /v1/keys.rotateKey', () => {
    it('returns new key; both old and new work during grace period', async () => {
      // Create a key
      const createResp = await authedRequest('POST', '/v1/keys.createKey', {
        name: 'e2e-rotate-test',
      });
      const { key: oldKey, keyId: oldKeyId } = createResp.json().data;

      // Rotate with a long grace period (60 seconds)
      const rotateResp = await authedRequest('POST', '/v1/keys.rotateKey', {
        keyId: oldKeyId,
        gracePeriodMs: 60000,
      });

      expect(rotateResp.statusCode).toBe(200);
      const rotateData = rotateResp.json().data;
      expect(rotateData.key).toBeTypeOf('string');
      expect(rotateData.keyId).toBeTypeOf('string');
      expect(rotateData.key).not.toBe(oldKey);
      expect(rotateData.keyId).not.toBe(oldKeyId);

      const newKey = rotateData.key;

      // Both old and new key should verify as valid during grace period
      const [oldVerify, newVerify] = await Promise.all([
        ctx.app.inject({
          method: 'POST',
          url: '/v1/keys.verifyKey',
          payload: { key: oldKey },
        }),
        ctx.app.inject({
          method: 'POST',
          url: '/v1/keys.verifyKey',
          payload: { key: newKey },
        }),
      ]);

      expect(oldVerify.json().valid).toBe(true);
      expect(newVerify.json().valid).toBe(true);
    });
  });

  // ── Revoke key ──────────────────────────────────────────────────────────────

  describe('POST /v1/keys.revokeKey', () => {
    it('revokes a key; verify returns KEY_REVOKED', async () => {
      // Create a key
      const createResp = await authedRequest('POST', '/v1/keys.createKey', {
        name: 'e2e-revoke-test',
      });
      const { key, keyId } = createResp.json().data;

      // Verify it works first
      const preVerify = await ctx.app.inject({
        method: 'POST',
        url: '/v1/keys.verifyKey',
        payload: { key },
      });
      expect(preVerify.json().valid).toBe(true);

      // Revoke with no grace period
      const revokeResp = await authedRequest('POST', '/v1/keys.revokeKey', {
        keyId,
        gracePeriodMs: 0,
      });
      expect(revokeResp.statusCode).toBe(200);
      expect(revokeResp.json().data.success).toBe(true);

      // Verify should now return KEY_REVOKED
      const postVerify = await ctx.app.inject({
        method: 'POST',
        url: '/v1/keys.verifyKey',
        payload: { key },
      });
      expect(postVerify.json().valid).toBe(false);
      expect(postVerify.json().code).toBe('KEY_REVOKED');
    });
  });

  // ── Rate limiting ──────────────────────────────────────────────────────────

  describe('rate limiting', () => {
    it('returns RATE_LIMITED after exceeding the configured limit', async () => {
      // Create a key with a rate limit of 3 requests per 60-second window
      const createResp = await authedRequest('POST', '/v1/keys.createKey', {
        name: 'e2e-rate-limit-test',
        rateLimitConfig: {
          algorithm: 'fixed_window',
          limit: 3,
          window: 60000,
        },
      });
      const { key } = createResp.json().data;

      // Make 3 successful verifications
      for (let i = 0; i < 3; i++) {
        const resp = await ctx.app.inject({
          method: 'POST',
          url: '/v1/keys.verifyKey',
          payload: { key },
        });
        expect(resp.json().valid).toBe(true);
      }

      // 4th verification should be rate limited
      const limitedResp = await ctx.app.inject({
        method: 'POST',
        url: '/v1/keys.verifyKey',
        payload: { key },
      });

      const limitedBody = limitedResp.json();
      expect(limitedBody.valid).toBe(false);
      expect(limitedBody.code).toBe('RATE_LIMITED');
      expect(limitedBody.rateLimit).toBeDefined();
      expect(limitedBody.rateLimit.limit).toBe(3);
      expect(limitedBody.rateLimit.remaining).toBe(0);
    });
  });
});
