import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, type TestContext } from './setup';

describe('Webhooks endpoints (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestApp();
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

  // ── Create webhook ─────────────────────────────────────────────────────────

  describe('POST /v1/webhooks', () => {
    it('creates a webhook', async () => {
      const response = await authedRequest('POST', '/v1/webhooks', {
        url: 'https://example.com/webhook/e2e-create',
        events: ['key.created', 'key.revoked'],
      });

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body.data).toBeDefined();
      expect(body.data.id).toBeTypeOf('string');
      expect(body.data.id).toMatch(/^whep_/);
      expect(body.data.url).toBe('https://example.com/webhook/e2e-create');
      expect(body.data.events).toEqual(['key.created', 'key.revoked']);
      expect(body.data.enabled).toBe(true);
      expect(body.data.workspaceId).toBe(ctx.workspaceId);
      // Secret should be present (full secret returned on create)
      expect(body.data.secret).toBeTypeOf('string');
    });
  });

  // ── List webhooks ──────────────────────────────────────────────────────────

  describe('GET /v1/webhooks', () => {
    it('lists webhooks with masked secrets', async () => {
      // Ensure at least one webhook exists
      await authedRequest('POST', '/v1/webhooks', {
        url: 'https://example.com/webhook/e2e-list',
        events: ['key.created'],
      });

      const response = await authedRequest('GET', '/v1/webhooks');
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(1);

      // Secrets should be masked
      for (const webhook of body.data) {
        expect(webhook.secret).toMatch(/^whsec_\*{8}.{4}$/);
        expect(webhook.workspaceId).toBe(ctx.workspaceId);
      }
    });
  });

  // ── Update webhook ─────────────────────────────────────────────────────────

  describe('PATCH /v1/webhooks/:id', () => {
    it('updates webhook url and events', async () => {
      // Create a webhook first
      const createResp = await authedRequest('POST', '/v1/webhooks', {
        url: 'https://example.com/webhook/e2e-update-before',
        events: ['key.created'],
      });
      const webhookId = createResp.json().data.id;

      // Update it
      const response = await authedRequest(
        'PATCH',
        `/v1/webhooks/${webhookId}`,
        {
          url: 'https://example.com/webhook/e2e-update-after',
          events: ['key.created', 'key.rotated'],
        },
      );

      expect(response.statusCode).toBe(200);
      const updated = response.json().data;
      expect(updated.url).toBe('https://example.com/webhook/e2e-update-after');
      expect(updated.events).toEqual(['key.created', 'key.rotated']);
      // Secret should be masked in update response too
      expect(updated.secret).toMatch(/^whsec_\*{8}.{4}$/);
    });

    it('disables a webhook via active: false', async () => {
      const createResp = await authedRequest('POST', '/v1/webhooks', {
        url: 'https://example.com/webhook/e2e-disable',
        events: ['key.created'],
      });
      const webhookId = createResp.json().data.id;

      const response = await authedRequest(
        'PATCH',
        `/v1/webhooks/${webhookId}`,
        {
          active: false,
        },
      );

      expect(response.statusCode).toBe(200);
      expect(response.json().data.enabled).toBe(false);
    });
  });

  // ── Delete webhook ─────────────────────────────────────────────────────────

  describe('DELETE /v1/webhooks/:id', () => {
    it('deletes a webhook', async () => {
      // Create a webhook
      const createResp = await authedRequest('POST', '/v1/webhooks', {
        url: 'https://example.com/webhook/e2e-delete',
        events: ['key.created'],
      });
      const webhookId = createResp.json().data.id;

      // Delete it
      const deleteResp = await authedRequest(
        'DELETE',
        `/v1/webhooks/${webhookId}`,
      );
      expect(deleteResp.statusCode).toBe(200);
      expect(deleteResp.json().data.success).toBe(true);

      // Verify it's gone
      const getResp = await authedRequest(
        'GET',
        `/v1/webhooks/${webhookId}`,
      );
      expect(getResp.statusCode).toBe(404);
    });
  });

  // ── Auth ────────────────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('POST /v1/webhooks returns 401 without root key', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/v1/webhooks',
        payload: {
          url: 'https://example.com/webhook',
          events: ['key.created'],
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it('GET /v1/webhooks returns 401 without root key', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: '/v1/webhooks',
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
