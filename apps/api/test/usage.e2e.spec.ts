import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, type TestContext } from './setup';

describe('Usage endpoints (e2e)', () => {
  let ctx: TestContext;
  let testKeyId: string;
  let testRawKey: string;

  beforeAll(async () => {
    ctx = await setupTestApp();

    // Create a key to report usage against
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/keys.createKey',
      headers: { authorization: `Bearer ${ctx.rootKey}` },
      payload: { name: 'e2e-usage-key' },
    });
    const body = response.json();
    testKeyId = body.data.keyId;
    testRawKey = body.data.key;
  });

  afterAll(async () => {
    await teardownTestApp(ctx);
  });

  function authedRequest(method: string, url: string, payload?: unknown) {
    const opts: Record<string, unknown> = {
      method,
      url,
      headers: { authorization: `Bearer ${ctx.rootKey}` },
    };
    if (payload !== undefined) {
      opts.payload = payload;
    }
    return ctx.app.inject(opts as any);
  }

  // ── Report usage ────────────────────────────────────────────────────────────

  describe('POST /v1/usage.report', () => {
    it('records usage successfully', async () => {
      const response = await authedRequest('POST', '/v1/usage.report', {
        keyId: testKeyId,
        tokens: { input: 150, output: 50 },
        model: 'gpt-4',
        cost: 0.05,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.success).toBe(true);
    });

    it('records usage without optional fields', async () => {
      const response = await authedRequest('POST', '/v1/usage.report', {
        keyId: testKeyId,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.success).toBe(true);
    });
  });

  // ── Usage summary ──────────────────────────────────────────────────────────

  describe('GET /v1/usage/summary', () => {
    it('returns workspace usage summary', async () => {
      const response = await authedRequest('GET', '/v1/usage/summary');

      expect(response.statusCode).toBe(200);
      const summary = response.json().data;
      expect(summary).toBeDefined();
      expect(summary.requestsToday).toBeTypeOf('number');
      expect(summary.requestsMonth).toBeTypeOf('number');
      expect(summary.tokensMonth).toBeTypeOf('number');
      expect(summary.costCentsMonth).toBeTypeOf('number');
      expect(Array.isArray(summary.topKeys)).toBe(true);
    });
  });

  // ── Verify after usage ──────────────────────────────────────────────────────

  describe('verify after usage report', () => {
    it('verify includes usage info in response', async () => {
      // Report some usage first
      await authedRequest('POST', '/v1/usage.report', {
        keyId: testKeyId,
        tokens: { input: 100, output: 25 },
        model: 'gpt-4',
      });

      // Verify the key
      const verifyResp = await ctx.app.inject({
        method: 'POST',
        url: '/v1/keys.verifyKey',
        payload: { key: testRawKey },
      });

      expect(verifyResp.statusCode).toBe(200);
      const body = verifyResp.json();
      expect(body.valid).toBe(true);
      expect(body.usage).toBeDefined();
      expect(body.usage.requests).toBeTypeOf('number');
      expect(body.usage.tokens).toBeTypeOf('number');
    });
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('POST /v1/usage.report returns 401 without root key', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/v1/usage.report',
        payload: { keyId: testKeyId },
      });
      expect(response.statusCode).toBe(401);
    });

    it('GET /v1/usage/summary returns 401 without root key', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/v1/usage/summary',
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
