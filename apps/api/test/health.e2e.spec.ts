import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestApp, teardownTestApp, type TestContext } from './setup';

describe('Health endpoint (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestApp();
  });

  afterAll(async () => {
    await teardownTestApp(ctx);
  });

  it('GET /health returns 200 with healthy status when DB and Redis are up', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
    expect(body.checks).toBeDefined();
    expect(body.checks.database.status).toBe('up');
    expect(body.checks.database.latency).toBeTypeOf('number');
    expect(body.checks.redis.status).toBe('up');
    expect(body.checks.redis.latency).toBeTypeOf('number');
  });
});
