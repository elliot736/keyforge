import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VerifyService } from './verify.service';
import { hashApiKey } from '@keyforge/shared';

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockRedis() {
  return {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    decr: vi.fn().mockResolvedValue(0),
    incr: vi.fn().mockResolvedValue(1),
    hincrby: vi.fn().mockResolvedValue(1),
    hget: vi.fn().mockResolvedValue(null),
  };
}

function createMockDb() {
  let dbRows: any[] = [];
  const mockQuery = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    // The verify service calls .then((rows) => rows[0]) on the query chain.
    // We implement a real thenable so the callback is invoked correctly.
    then: vi.fn().mockImplementation((resolve: any, reject?: any) => {
      return Promise.resolve(dbRows).then(resolve, reject);
    }),
  };
  return {
    select: vi.fn().mockReturnValue(mockQuery),
    _mockQuery: mockQuery,
    /** Set the rows that the next DB query will return. */
    _setRows(rows: any[]) {
      dbRows = rows;
    },
  };
}

function createMockRateLimitService() {
  return {
    check: vi.fn().mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
    }),
  };
}

function buildKeyData(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key_abc123',
    workspaceId: 'ws_test',
    name: 'Test Key',
    ownerId: 'user_1',
    environment: 'live',
    scopes: ['read', 'write'],
    meta: { foo: 'bar' },
    rateLimitMax: null as number | null,
    rateLimitWindow: null as number | null,
    rateLimitRefill: null as number | null,
    tokenBudget: null as number | null,
    spendCapCents: null as number | null,
    expiresAt: null as string | null,
    revokedAt: null as string | null,
    enabled: true,
    usageLimit: null as number | null,
    remaining: null as number | null,
    ...overrides,
  };
}

function buildDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key_abc123',
    workspaceId: 'ws_test',
    name: 'Test Key',
    keyHash: 'somehash',
    prefix: 'sk_abc12345...',
    ownerId: 'user_1',
    environment: 'live' as const,
    scopes: ['read', 'write'],
    metadata: { foo: 'bar' } as Record<string, unknown> | null,
    rateLimitMax: null as number | null,
    rateLimitWindow: null as number | null,
    rateLimitRefill: null as number | null,
    tokenBudget: null as bigint | number | null,
    spendCapCents: null as number | null,
    expiresAt: null as Date | null,
    revokedAt: null as Date | null,
    enabled: true,
    usageLimit: null as number | null,
    usageCount: 0,
    remaining: null as number | null,
    lastUsedAt: null as Date | null,
    description: null as string | null,
    permissions: null,
    revokedReason: null as string | null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('VerifyService', () => {
  let service: VerifyService;
  let redis: ReturnType<typeof createMockRedis>;
  let db: ReturnType<typeof createMockDb>;
  let rateLimitService: ReturnType<typeof createMockRateLimitService>;

  const RAW_KEY = 'sk_testkey123';
  const KEY_HASH = hashApiKey(RAW_KEY);

  beforeEach(() => {
    redis = createMockRedis();
    db = createMockDb();
    rateLimitService = createMockRateLimitService();

    service = new VerifyService(db as any, redis as any, rateLimitService as any);
  });

  it('valid key from cache returns { valid: true } with correct fields', async () => {
    const keyData = buildKeyData();
    redis.get.mockImplementation((key: string) => {
      if (key === `keyforge:key:${KEY_HASH}`) return Promise.resolve(JSON.stringify(keyData));
      return Promise.resolve(null);
    });
    redis.hget.mockResolvedValue('5');

    const result = await service.verify(RAW_KEY);

    expect(result.valid).toBe(true);
    expect(result).toMatchObject({
      valid: true,
      keyId: 'key_abc123',
      ownerId: 'user_1',
      workspaceId: 'ws_test',
      name: 'Test Key',
      environment: 'live',
      scopes: ['read', 'write'],
      meta: { foo: 'bar' },
    });
  });

  it('unknown key returns { valid: false, code: KEY_NOT_FOUND }', async () => {
    redis.get.mockResolvedValue(null);
    db._setRows([]); // DB returns no rows

    const result = await service.verify(RAW_KEY);

    expect(result).toEqual({ valid: false, code: 'KEY_NOT_FOUND' });
  });

  it('revoked key returns { valid: false, code: KEY_REVOKED }', async () => {
    const keyData = buildKeyData({
      revokedAt: new Date(Date.now() - 60_000).toISOString(), // revoked in the past
    });
    redis.get.mockImplementation((key: string) => {
      if (key === `keyforge:key:${KEY_HASH}`) return Promise.resolve(JSON.stringify(keyData));
      return Promise.resolve(null);
    });

    const result = await service.verify(RAW_KEY);

    expect(result).toEqual({ valid: false, code: 'KEY_REVOKED' });
  });

  it('expired key returns { valid: false, code: KEY_EXPIRED }', async () => {
    const keyData = buildKeyData({
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    redis.get.mockImplementation((key: string) => {
      if (key === `keyforge:key:${KEY_HASH}`) return Promise.resolve(JSON.stringify(keyData));
      return Promise.resolve(null);
    });

    const result = await service.verify(RAW_KEY);

    expect(result).toEqual({ valid: false, code: 'KEY_EXPIRED' });
  });

  it('rate limited key returns { valid: false, code: RATE_LIMITED }', async () => {
    const resetTime = Date.now() + 30_000;
    const keyData = buildKeyData({
      rateLimitMax: 10,
      rateLimitWindow: 60,
    });
    redis.get.mockImplementation((key: string) => {
      if (key === `keyforge:key:${KEY_HASH}`) return Promise.resolve(JSON.stringify(keyData));
      return Promise.resolve(null);
    });
    rateLimitService.check.mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      reset: resetTime,
    });

    const result = await service.verify(RAW_KEY);

    expect(result.valid).toBe(false);
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.rateLimit).toEqual({
      limit: 10,
      remaining: 0,
      reset: resetTime,
    });
  });

  it('token budget exceeded returns { valid: false, code: BUDGET_EXCEEDED }', async () => {
    const keyData = buildKeyData({ tokenBudget: 1000 });
    redis.get.mockImplementation((key: string) => {
      if (key === `keyforge:key:${KEY_HASH}`) return Promise.resolve(JSON.stringify(keyData));
      // Token usage key returns over budget
      if (key.startsWith('keyforge:usage:tokens:')) return Promise.resolve('1500');
      return Promise.resolve(null);
    });

    const result = await service.verify(RAW_KEY);

    expect(result).toEqual({ valid: false, code: 'BUDGET_EXCEEDED' });
  });

  it('spend cap exceeded returns { valid: false, code: SPEND_CAP_EXCEEDED }', async () => {
    const keyData = buildKeyData({ spendCapCents: 5000 });
    redis.get.mockImplementation((key: string) => {
      if (key === `keyforge:key:${KEY_HASH}`) return Promise.resolve(JSON.stringify(keyData));
      if (key.startsWith('keyforge:usage:cost:')) return Promise.resolve('6000');
      return Promise.resolve(null);
    });

    const result = await service.verify(RAW_KEY);

    expect(result).toEqual({ valid: false, code: 'SPEND_CAP_EXCEEDED' });
  });

  it('disabled key returns { valid: false, code: KEY_REVOKED }', async () => {
    const keyData = buildKeyData({ enabled: false });
    redis.get.mockImplementation((key: string) => {
      if (key === `keyforge:key:${KEY_HASH}`) return Promise.resolve(JSON.stringify(keyData));
      return Promise.resolve(null);
    });

    const result = await service.verify(RAW_KEY);

    expect(result).toEqual({ valid: false, code: 'KEY_REVOKED' });
  });

  it('key in grace period returns { valid: true }', async () => {
    const keyData = buildKeyData({
      revokedAt: new Date(Date.now() + 3_600_000).toISOString(), // revoked in the future (grace period)
    });
    redis.get.mockImplementation((key: string) => {
      if (key === `keyforge:key:${KEY_HASH}`) return Promise.resolve(JSON.stringify(keyData));
      return Promise.resolve(null);
    });
    redis.hget.mockResolvedValue('0');

    const result = await service.verify(RAW_KEY);

    expect(result.valid).toBe(true);
    expect(result.keyId).toBe('key_abc123');
  });

  it('cache miss falls back to database', async () => {
    redis.get.mockResolvedValue(null);
    redis.hget.mockResolvedValue('0');

    const row = buildDbRow({ keyHash: KEY_HASH });
    db._setRows([row]);

    const result = await service.verify(RAW_KEY);

    expect(result.valid).toBe(true);
    expect(result.keyId).toBe('key_abc123');
    // Should have attempted to cache the result
    expect(redis.set).toHaveBeenCalledWith(
      `keyforge:key:${KEY_HASH}`,
      expect.any(String),
      'EX',
      300,
    );
  });

  it('verify returns usage info', async () => {
    const keyData = buildKeyData();
    redis.get.mockImplementation((key: string) => {
      if (key === `keyforge:key:${KEY_HASH}`) return Promise.resolve(JSON.stringify(keyData));
      // Token usage
      if (key.startsWith('keyforge:usage:tokens:')) return Promise.resolve('42');
      return Promise.resolve(null);
    });
    redis.hget.mockResolvedValue('7');

    const result = await service.verify(RAW_KEY);

    expect(result.valid).toBe(true);
    expect(result.usage).toEqual({
      requests: 7,
      tokens: 42,
    });
  });
});
