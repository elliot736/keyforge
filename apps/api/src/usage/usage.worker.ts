import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { eq, and, lte, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { RedisService } from '../redis/redis.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AuditService } from '../audit/audit.service';
import { generateId } from '@keyforge/shared';

@Injectable()
export class UsageWorker {
  private readonly logger = new Logger(UsageWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly redis: RedisService,
    private readonly webhooksService: WebhooksService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Every minute: flush Redis usage counters to Postgres ─────────────────

  @Cron('*/1 * * * *')
  async flushUsageCounters(): Promise<void> {
    try {
      let cursor = '0';
      const pattern = 'keyforge:usage:*:*T*'; // Match hourly bucket keys
      const processed: string[] = [];

      do {
        const [nextCursor, keys] = await this.redis.scan(
          parseInt(cursor, 10),
          'MATCH',
          pattern,
          'COUNT',
          200,
        );
        cursor = nextCursor;

        for (const key of keys) {
          // Skip non-hourly-bucket keys (tokens:, cost:, etc.)
          if (key.includes(':tokens:') || key.includes(':cost:') || key.includes(':threshold:')) {
            continue;
          }

          try {
            await this.processHourlyBucket(key);
            processed.push(key);
          } catch (err) {
            this.logger.warn(
              `Failed to process usage key ${key}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      } while (cursor !== '0');

      // Keys are now atomically deleted in processHourlyBucket via MULTI/EXEC

      if (processed.length > 0) {
        this.logger.debug(`Flushed ${processed.length} usage counters to Postgres`);
      }
    } catch (err) {
      this.logger.error(
        `Usage counter flush failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Every 5 minutes: sync lastUsedAt from Redis to Postgres ──────────────

  @Cron('*/5 * * * *')
  async syncLastUsedAt(): Promise<void> {
    try {
      let cursor = '0';
      const pattern = 'keyforge:lastused:*';
      const updates: Array<{ keyId: string; lastUsedAt: string }> = [];

      do {
        const [nextCursor, keys] = await this.redis.scan(
          parseInt(cursor, 10),
          'MATCH',
          pattern,
          'COUNT',
          200,
        );
        cursor = nextCursor;

        for (const key of keys) {
          const value = await this.redis.get(key);
          if (!value) continue;

          // Extract keyId from keyforge:lastused:{keyId}
          const keyId = key.replace('keyforge:lastused:', '');
          updates.push({ keyId, lastUsedAt: value });
        }
      } while (cursor !== '0');

      if (updates.length === 0) return;

      // Update apiKeys.lastUsedAt using parameterized queries
      for (const { keyId, lastUsedAt } of updates) {
        await this.db.update(schema.apiKeys)
          .set({ lastUsedAt: new Date(parseInt(lastUsedAt)) })
          .where(eq(schema.apiKeys.id, keyId));
      }

      // Clean up processed Redis keys
      const keysToDelete = updates.map((u) => `keyforge:lastused:${u.keyId}`);
      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
      }

      this.logger.debug(`Synced lastUsedAt for ${updates.length} keys`);
    } catch (err) {
      this.logger.error(
        `lastUsedAt sync failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Every 5 minutes: expire keys past their expiresAt ──────────────────

  @Cron('*/5 * * * *')
  async expireKeys(): Promise<void> {
    try {
      const expiredKeys = await this.db
        .select()
        .from(schema.apiKeys)
        .where(
          and(
            lte(schema.apiKeys.expiresAt, new Date()),
            isNull(schema.apiKeys.revokedAt),
            eq(schema.apiKeys.enabled, true),
          ),
        );

      for (const key of expiredKeys) {
        await this.db
          .update(schema.apiKeys)
          .set({ enabled: false })
          .where(eq(schema.apiKeys.id, key.id));

        await this.webhooksService.fireEvent(key.workspaceId, 'key.expired', {
          keyId: key.id,
          name: key.name,
          expiresAt: key.expiresAt?.toISOString(),
        });

        await this.auditService.log({
          workspaceId: key.workspaceId,
          actorId: 'system',
          actorType: 'system',
          action: 'key.expired',
          resourceType: 'api_key',
          resourceId: key.id,
          metadata: { expiresAt: key.expiresAt?.toISOString() },
        });
      }

      if (expiredKeys.length > 0) {
        this.logger.log(`Expired ${expiredKeys.length} keys`);
      }
    } catch (err) {
      this.logger.error(
        `Key expiration check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Daily at 3am: clean up old audit logs per plan ─────────────────────

  @Cron('0 3 * * *')
  async cleanupAuditLogs(): Promise<void> {
    try {
      const workspaces = await this.db
        .select({ id: schema.workspaces.id, plan: schema.workspaces.plan })
        .from(schema.workspaces);

      for (const ws of workspaces) {
        let retentionDays: number | null = null;

        if (ws.plan === 'free') {
          retentionDays = 30;
        } else if (ws.plan === 'pro') {
          retentionDays = 365;
        }
        // enterprise: skip (unlimited retention)

        if (retentionDays != null) {
          const deleted = await this.auditService.cleanup(ws.id, retentionDays);
          if (deleted > 0) {
            this.logger.log(
              `Cleaned ${deleted} audit logs for workspace ${ws.id} (plan: ${ws.plan}, retention: ${retentionDays}d)`,
            );
          }
        }
      }
    } catch (err) {
      this.logger.error(
        `Audit log cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async processHourlyBucket(redisKey: string): Promise<void> {
    // Parse the Redis key: keyforge:usage:{keyId}:{hourBucket}
    // e.g. keyforge:usage:key_abc123:2026-03-20T14:00
    const parts = redisKey.split(':');
    if (parts.length < 4) return;

    const keyId = parts[2];
    if (!keyId) return;
    const hourBucket = parts.slice(3).join(':');
    const period = hourBucket.slice(0, 10); // daily period, e.g. 2026-03-20

    // Atomically fetch and delete the hash to avoid double-counting
    const pipeline = this.redis.multi();
    pipeline.hgetall(redisKey);
    pipeline.del(redisKey);
    const results = await pipeline.exec();
    const data = results?.[0]?.[1] as Record<string, string> | null;
    if (!data || Object.keys(data).length === 0) return;

    const requests = parseInt(data.requests ?? '0', 10);
    const tokensInput = parseInt(data.tokens_input ?? '0', 10);
    const tokensOutput = parseInt(data.tokens_output ?? '0', 10);
    const costCents = parseInt(data.cost_cents ?? '0', 10);

    if (requests === 0) return;

    // Look up workspaceId for this key
    const [keyRow] = await this.db
      .select({ workspaceId: schema.apiKeys.workspaceId })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.id, keyId))
      .limit(1);

    if (!keyRow) return;

    // Upsert into usage_records. Since our schema uses (keyId, period) as a logical grouping
    // but id as PK, we need to check if a record exists first.
    const [existing] = await this.db
      .select({ id: schema.usageRecords.id })
      .from(schema.usageRecords)
      .where(
        sql`${schema.usageRecords.keyId} = ${keyId} AND ${schema.usageRecords.period} = ${period}`,
      )
      .limit(1);

    if (existing) {
      await this.db
        .update(schema.usageRecords)
        .set({
          verifications: sql`${schema.usageRecords.verifications} + ${requests}`,
          successes: sql`${schema.usageRecords.successes} + ${requests}`,
        })
        .where(eq(schema.usageRecords.id, existing.id));
    } else {
      await this.db.insert(schema.usageRecords).values({
        id: generateId('usage'),
        keyId,
        workspaceId: keyRow.workspaceId,
        period,
        verifications: requests,
        successes: requests,
        rateLimited: 0,
        usageExceeded: 0,
      });
    }
  }
}
