import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitService } from './ratelimit.service';
import type { RateLimitConfig } from './ratelimit.service';

// ─── Mock Factory ────────────────────────────────────────────────────────────

function createMockRedis() {
  return {
    evalsha: vi.fn(),
    eval: vi.fn(),
    script: vi.fn().mockResolvedValue('sha_placeholder'),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RateLimitService', () => {
  let service: RateLimitService;
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    redis = createMockRedis();
    service = new RateLimitService(redis as any);

    // Simulate onModuleInit to load script SHAs
    await service.onModuleInit();
  });

  // ─── Fixed Window ──────────────────────────────────────────────────────

  describe('fixed_window', () => {
    const config: RateLimitConfig = {
      algorithm: 'fixed_window',
      limit: 100,
      window: 60_000,
    };

    it('allows requests under limit', async () => {
      const now = Date.now();
      // Lua returns [allowed, limit, remaining, reset]
      redis.evalsha.mockResolvedValue([1, 100, 95, now + 30_000]);

      const result = await service.check('key_1', config);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(95);
      expect(result.reset).toBeGreaterThan(now);
    });

    it('blocks requests over limit', async () => {
      const now = Date.now();
      redis.evalsha.mockResolvedValue([0, 100, 0, now + 45_000]);

      const result = await service.check('key_1', config);

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(0);
    });
  });

  // ─── Sliding Window ───────────────────────────────────────────────────

  describe('sliding_window', () => {
    const config: RateLimitConfig = {
      algorithm: 'sliding_window',
      limit: 50,
      window: 60_000,
    };

    it('returns correct remaining count', async () => {
      const now = Date.now();
      redis.evalsha.mockResolvedValue([1, 50, 30, now + 60_000]);

      const result = await service.check('key_2', config);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(30);
      expect(result.limit).toBe(50);
    });
  });

  // ─── Token Bucket ─────────────────────────────────────────────────────

  describe('token_bucket', () => {
    const config: RateLimitConfig = {
      algorithm: 'token_bucket',
      limit: 20,
      refillRate: 5,
    };

    it('allows burst up to limit', async () => {
      const now = Date.now();
      redis.evalsha.mockResolvedValue([1, 20, 19, now + 200]);

      const result = await service.check('key_3', config);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(20);
      expect(result.remaining).toBe(19);
    });
  });

  // ─── Dispatch ─────────────────────────────────────────────────────────

  describe('check dispatches to correct algorithm', () => {
    it('dispatches fixed_window', async () => {
      const now = Date.now();
      redis.evalsha.mockResolvedValue([1, 10, 9, now + 1000]);

      await service.check('key_x', {
        algorithm: 'fixed_window',
        limit: 10,
        window: 10_000,
      });

      expect(redis.evalsha).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'ratelimit:fw:key_x',
        expect.any(String), // window
        expect.any(String), // limit
        expect.any(String), // now
      );
    });

    it('dispatches sliding_window', async () => {
      const now = Date.now();
      redis.evalsha.mockResolvedValue([1, 10, 9, now + 1000]);

      await service.check('key_y', {
        algorithm: 'sliding_window',
        limit: 10,
        window: 10_000,
      });

      expect(redis.evalsha).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'ratelimit:sw:key_y',
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });

    it('dispatches token_bucket', async () => {
      const now = Date.now();
      redis.evalsha.mockResolvedValue([1, 10, 9, now + 1000]);

      await service.check('key_z', {
        algorithm: 'token_bucket',
        limit: 10,
        refillRate: 5,
      });

      expect(redis.evalsha).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'ratelimit:tb:key_z',
        expect.any(String), // limit
        expect.any(String), // refillRate
        expect.any(String), // now
        expect.any(String), // consume
      );
    });
  });

  // ─── Fail Open ────────────────────────────────────────────────────────

  it('fails open when Redis is unavailable (returns allowed: true)', async () => {
    redis.evalsha.mockRejectedValue(new Error('ECONNREFUSED'));
    redis.eval.mockRejectedValue(new Error('ECONNREFUSED'));

    const config: RateLimitConfig = {
      algorithm: 'fixed_window',
      limit: 100,
      window: 60_000,
    };

    const result = await service.check('key_fail', config);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(100);
  });

  // ─── EVALSHA fallback to EVAL ─────────────────────────────────────────

  it('falls back to EVAL when EVALSHA returns NOSCRIPT', async () => {
    const now = Date.now();
    redis.evalsha.mockRejectedValue(new Error('NOSCRIPT No matching script'));
    redis.eval.mockResolvedValue([1, 100, 99, now + 60_000]);

    const config: RateLimitConfig = {
      algorithm: 'fixed_window',
      limit: 100,
      window: 60_000,
    };

    const result = await service.check('key_fallback', config);

    expect(result.allowed).toBe(true);
    expect(redis.eval).toHaveBeenCalled();
  });
});
