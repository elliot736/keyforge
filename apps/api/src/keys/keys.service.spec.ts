import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { KeysService } from './keys.service';

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockRedis() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  };
}

function createMockAuditService() {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockWebhooksService() {
  return {
    fireEvent: vi.fn().mockResolvedValue(undefined),
  };
}

function buildDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key_abc123',
    workspaceId: 'ws_test',
    name: 'Test Key',
    description: null,
    keyHash: 'fakehash123',
    prefix: 'sk_abc12345...',
    ownerId: 'user_1',
    environment: 'live' as const,
    scopes: ['read'],
    permissions: null,
    metadata: null as Record<string, unknown> | null,
    rateLimitMax: null as number | null,
    rateLimitWindow: null as number | null,
    rateLimitRefill: null as number | null,
    tokenBudget: null as number | null,
    spendCapCents: null as number | null,
    expiresAt: null as Date | null,
    usageLimit: null as number | null,
    usageCount: 0,
    remaining: null as number | null,
    enabled: true,
    revokedAt: null as Date | null,
    revokedReason: null as string | null,
    lastUsedAt: null as Date | null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function createMockDb() {
  // We build chainable query builders per-call
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    then: vi.fn(),
  };

  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };

  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };

  return {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
    update: vi.fn().mockReturnValue(updateChain),
    transaction: vi.fn(),
    _select: selectChain,
    _insert: insertChain,
    _update: updateChain,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('KeysService', () => {
  let service: KeysService;
  let db: ReturnType<typeof createMockDb>;
  let redis: ReturnType<typeof createMockRedis>;
  let audit: ReturnType<typeof createMockAuditService>;
  let webhooks: ReturnType<typeof createMockWebhooksService>;

  beforeEach(() => {
    db = createMockDb();
    redis = createMockRedis();
    audit = createMockAuditService();
    webhooks = createMockWebhooksService();

    service = new KeysService(db as any, redis as any, audit as any, webhooks as any);
  });

  // ─── createKey ───────────────────────────────────────────────────────────

  describe('createKey', () => {
    it('generates a key, stores hash, returns raw key once', async () => {
      const row = buildDbRow();
      db._insert.returning.mockResolvedValue([row]);

      const result = await service.createKey('ws_test', { name: 'My Key' } as any, 'actor_1');

      expect(result.key).toMatch(/^sk_/);
      expect(result.keyId).toMatch(/^key_/);
      // Should have stored in DB
      expect(db.insert).toHaveBeenCalled();
      expect(db._insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws_test',
          name: 'My Key',
          keyHash: expect.any(String),
        }),
      );
      // Should have cached in Redis
      expect(redis.set).toHaveBeenCalled();
    });

    it('stores tokenBudget and spendCapCents', async () => {
      const row = buildDbRow({ tokenBudget: 50000, spendCapCents: 1000 });
      db._insert.returning.mockResolvedValue([row]);

      await service.createKey(
        'ws_test',
        { name: 'Budget Key', tokenBudget: 50000, spendCapCents: 1000 } as any,
        'actor_1',
      );

      expect(db._insert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenBudget: 50000,
          spendCapCents: 1000,
        }),
      );
    });
  });

  // ─── getKey ──────────────────────────────────────────────────────────────

  describe('getKey', () => {
    it('returns correct shape, never exposes hash', async () => {
      const row = buildDbRow();
      // getKey uses destructured array: const [row] = await db.select()...
      // The select chain resolves via .limit() which returns an array
      db._select.limit.mockResolvedValue([row]);

      const result = await service.getKey('key_abc123', 'ws_test');

      expect(result.id).toBe('key_abc123');
      expect(result.workspaceId).toBe('ws_test');
      expect(result.prefix).toBe('sk_abc12345...');
      expect(result.createdAt).toBeDefined();
      // keyHash must never be in the returned object
      expect((result as any).keyHash).toBeUndefined();
      expect((result as any).hash).toBeUndefined();
    });

    it('throws NotFoundException for wrong workspace', async () => {
      db._select.limit.mockResolvedValue([]);

      await expect(
        service.getKey('key_abc123', 'ws_wrong'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── revokeKey ───────────────────────────────────────────────────────────

  describe('revokeKey', () => {
    it('sets revokedAt, invalidates cache (no grace period)', async () => {
      const row = buildDbRow();
      db._select.limit.mockResolvedValue([row]);
      db._update.where.mockResolvedValue(undefined);

      await service.revokeKey('key_abc123', 'ws_test', 0, 'actor_1');

      expect(db.update).toHaveBeenCalled();
      expect(db._update.set).toHaveBeenCalledWith(
        expect.objectContaining({
          revokedAt: expect.any(Date),
          revokedReason: 'Revoked via API',
        }),
      );
      // No grace period: cache should be deleted
      expect(redis.del).toHaveBeenCalledWith(`keyforge:key:${row.keyHash}`);
    });

    it('with grace period sets future revokedAt and updates cache', async () => {
      const row = buildDbRow();
      db._select.limit.mockResolvedValue([row]);
      db._update.where.mockResolvedValue(undefined);

      const gracePeriodMs = 3_600_000; // 1 hour
      const beforeCall = Date.now();

      await service.revokeKey('key_abc123', 'ws_test', gracePeriodMs, 'actor_1');

      const setCall = db._update.set.mock.calls[0]?.[0];
      expect(setCall).toBeDefined();
      const revokedAt = setCall!.revokedAt as Date;
      expect(revokedAt.getTime()).toBeGreaterThanOrEqual(beforeCall + gracePeriodMs);

      // With grace period: cache should be updated, not deleted
      expect(redis.set).toHaveBeenCalledWith(
        `keyforge:key:${row.keyHash}`,
        expect.any(String),
        'EX',
        Math.ceil(gracePeriodMs / 1000),
      );
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  // ─── rotateKey ───────────────────────────────────────────────────────────

  describe('rotateKey', () => {
    it('creates new key and revokes old', async () => {
      const oldRow = buildDbRow();
      // First select (existing key lookup)
      db._select.limit.mockResolvedValueOnce([oldRow]);

      // Transaction mock
      db.transaction.mockImplementation(async (fn: any) => {
        const tx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
        };
        await fn(tx);
      });

      // After transaction, service queries for the new row
      const newRow = buildDbRow({
        id: 'key_new456',
        keyHash: 'newhash456',
        prefix: 'sk_new45678...',
      });
      db._select.limit.mockResolvedValueOnce([newRow]);
      // The .then() call on the post-tx select
      db._select.then = vi.fn().mockResolvedValue(newRow);

      const result = await service.rotateKey('key_abc123', 'ws_test', 0, 'actor_1');

      expect(result.key).toMatch(/^sk_/);
      expect(result.keyId).toMatch(/^key_/);
      expect(result.keyId).not.toBe('key_abc123'); // new key
      expect(db.transaction).toHaveBeenCalled();
    });
  });

  // ─── updateKey ───────────────────────────────────────────────────────────

  describe('updateKey', () => {
    it('updates fields and invalidates cache', async () => {
      const existing = buildDbRow();
      db._select.limit.mockResolvedValue([existing]);

      const updated = buildDbRow({ name: 'Updated Name' });
      db._update.returning.mockResolvedValue([updated]);

      const result = await service.updateKey(
        'key_abc123',
        'ws_test',
        { name: 'Updated Name' } as any,
        'actor_1',
      );

      expect(result.name).toBe('Updated Name');
      // Should invalidate old cache entry
      expect(redis.del).toHaveBeenCalledWith(`keyforge:key:${existing.keyHash}`);
      // Should set new cache entry
      expect(redis.set).toHaveBeenCalledWith(
        `keyforge:key:${updated.keyHash}`,
        expect.any(String),
        'EX',
        300,
      );
      // Audit log should have been called
      expect(audit.log).toHaveBeenCalled();
    });
  });
});
