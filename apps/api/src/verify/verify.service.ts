import { Injectable, Inject, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { RedisService } from '../redis/redis.service';
import { RateLimitService } from '../ratelimit/ratelimit.service';
import type { RateLimitConfig } from '../ratelimit/ratelimit.service';
import { hashApiKey } from '@keyforge/shared';
import type { VerifyKeyResponse } from '@keyforge/shared';

/** Internal key data stored in Redis cache. */
interface KeyData {
  id: string;
  workspaceId: string;
  name: string | null;
  ownerId: string | null;
  environment: string;
  scopes: string[] | null;
  meta: Record<string, unknown> | null;
  rateLimitMax: number | null;
  rateLimitWindow: number | null;
  rateLimitRefill: number | null;
  tokenBudget: number | null;
  spendCapCents: number | null;
  expiresAt: string | null;
  revokedAt: string | null;
  enabled: boolean;
  usageLimit: number | null;
  remaining: number | null;
}

const CACHE_TTL_SECONDS = 300; // 5 minutes

@Injectable()
export class VerifyService {
  private readonly logger = new Logger(VerifyService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly redis: RedisService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  // ─── Verify (HOT PATH) ──────────────────────────────────────────────────

  async verify(rawKey: string): Promise<VerifyKeyResponse> {
    // 1. Hash the key
    const hash = hashApiKey(rawKey);

    // 2. Redis lookup (primary read path)
    let keyData: KeyData;

    const cached = await this.redis.get(`keyforge:key:${hash}`);

    if (cached) {
      keyData = JSON.parse(cached);
    } else {
      // 3. Cache miss - query Postgres
      const row = await this.db
        .select()
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.keyHash, hash))
        .limit(1)
        .then((rows) => rows[0]);

      if (!row) {
        return { valid: false, code: 'KEY_NOT_FOUND' };
      }

      keyData = this.mapRowToKeyData(row);

      // Write back to cache (fire-and-forget for speed)
      this.redis
        .set(
          `keyforge:key:${hash}`,
          JSON.stringify(keyData),
          'EX',
          CACHE_TTL_SECONDS,
        )
        .catch(() => {});
    }

    // 4. Check if key is enabled
    if (!keyData.enabled) {
      return { valid: false, code: 'KEY_REVOKED' };
    }

    // 5. Check revocation (with grace period support)
    // revokedAt is set to now + gracePeriod at revocation time.
    // If current time is past revokedAt, the grace period has expired.
    if (keyData.revokedAt) {
      const revokedTime = new Date(keyData.revokedAt).getTime();
      if (Date.now() > revokedTime) {
        return { valid: false, code: 'KEY_REVOKED' };
      }
      // Otherwise, grace period is still active - continue as valid
    }

    // 6. Check expiration
    if (keyData.expiresAt) {
      if (Date.now() > new Date(keyData.expiresAt).getTime()) {
        return { valid: false, code: 'KEY_EXPIRED' };
      }
    }

    // 7. Rate limit check
    let rateLimitResult = null;
    if (keyData.rateLimitMax != null && keyData.rateLimitMax > 0) {
      const rlConfig: RateLimitConfig = {
        algorithm: 'sliding_window',
        limit: keyData.rateLimitMax,
        window: (keyData.rateLimitWindow ?? 60) * 1000,
        refillRate: keyData.rateLimitRefill ?? undefined,
      };

      rateLimitResult = await this.rateLimitService.check(
        keyData.id,
        rlConfig,
      );

      if (!rateLimitResult.allowed) {
        return {
          valid: false,
          code: 'RATE_LIMITED',
          rateLimit: {
            limit: rateLimitResult.limit,
            remaining: 0,
            reset: rateLimitResult.reset,
          },
        };
      }
    }

    // 8. Check token budget (if set)
    if (keyData.tokenBudget != null && keyData.tokenBudget > 0) {
      const monthKey = `keyforge:usage:tokens:${keyData.id}:${this.getCurrentMonth()}`;
      try {
        const tokensUsed = parseInt(
          (await this.redis.get(monthKey)) || '0',
          10,
        );
        if (tokensUsed >= keyData.tokenBudget) {
          return { valid: false, code: 'BUDGET_EXCEEDED' };
        }
      } catch {
        // Fail open on Redis errors for budget checks
      }
    }

    // 9. Check spend cap (if set)
    if (keyData.spendCapCents != null && keyData.spendCapCents > 0) {
      const monthKey = `keyforge:usage:cost:${keyData.id}:${this.getCurrentMonth()}`;
      try {
        const costCents = parseInt(
          (await this.redis.get(monthKey)) || '0',
          10,
        );
        if (costCents >= keyData.spendCapCents) {
          return { valid: false, code: 'SPEND_CAP_EXCEEDED' };
        }
      } catch {
        // Fail open on Redis errors for spend checks
      }
    }

    // 10. Check usage limit (remaining uses) - decrement atomically in Redis
    if (keyData.usageLimit != null) {
      const remainingKey = `keyforge:remaining:${keyData.id}`;
      const newRemaining = await this.redis.decr(remainingKey);
      if (newRemaining < 0) {
        // Undo the decrement since we're rejecting
        await this.redis.incr(remainingKey);
        return { valid: false, code: 'BUDGET_EXCEEDED' };
      }
    }

    // 11. Increment usage counter (fire-and-forget, async)
    const hourBucket = this.getCurrentHourBucket();
    this.redis
      .hincrby(`keyforge:usage:${keyData.id}:${hourBucket}`, 'requests', 1)
      .catch(() => {});

    // 12. Update lastUsedAt in Redis (batched to Postgres by cron)
    this.redis
      .set(`keyforge:lastused:${keyData.id}`, Date.now().toString())
      .catch(() => {});

    // 13. Read current usage from Redis
    const month = this.getCurrentMonth();
    const [requests, tokens] = await Promise.all([
      // requests from hourly bucket (current hour only for speed)
      this.redis.hget(`keyforge:usage:${keyData.id}:${hourBucket}`, 'requests'),
      this.redis.get(`keyforge:usage:tokens:${keyData.id}:${month}`),
    ]);

    // 14. Return full context
    return {
      valid: true,
      keyId: keyData.id,
      ownerId: keyData.ownerId,
      workspaceId: keyData.workspaceId,
      name: keyData.name,
      environment: keyData.environment,
      scopes: keyData.scopes ?? [],
      meta: keyData.meta,
      rateLimit: rateLimitResult
        ? {
            limit: rateLimitResult.limit,
            remaining: rateLimitResult.remaining,
            reset: rateLimitResult.reset,
          }
        : undefined,
      usage: {
        requests: parseInt(requests || '0', 10),
        tokens: parseInt(tokens || '0', 10),
      },
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private mapRowToKeyData(
    row: typeof schema.apiKeys.$inferSelect,
  ): KeyData {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      ownerId: row.ownerId,
      environment: row.environment,
      scopes: row.scopes,
      meta: row.metadata,
      rateLimitMax: row.rateLimitMax,
      rateLimitWindow: row.rateLimitWindow,
      rateLimitRefill: row.rateLimitRefill,
      tokenBudget: (meta.__tokenBudget as number) ?? null,
      spendCapCents: (meta.__spendCapCents as number) ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      enabled: row.enabled,
      usageLimit: row.usageLimit,
      remaining: row.remaining,
    };
  }

  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private getCurrentHourBucket(): string {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now.toISOString();
  }
}
