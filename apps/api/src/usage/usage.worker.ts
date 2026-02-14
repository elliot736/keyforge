import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { eq, sql, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { RedisService } from '../redis/redis.service';
import { generateId } from '@keyforge/shared';

@Injectable()
export class UsageWorker {
  private readonly logger = new Logger(UsageWorker.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly redis: RedisService,
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

      // Clean up processed Redis keys
      if (processed.length > 0) {
        // Only delete keys that have been fully processed and are older than the current hour
        const now = new Date();
        const currentHourBucket = `${now.toISOString().slice(0, 13)}:00`;

        const keysToDelete = processed.filter((key) => {
          // Extract the hour bucket from the key: keyforge:usage:{keyId}:{hourBucket}
          const parts = key.split(':');
          const hourBucket = parts.slice(3).join(':');
          return hourBucket < currentHourBucket;
        });

        if (keysToDelete.length > 0) {
          await this.redis.del(...keysToDelete);
          this.logger.debug(`Cleaned up ${keysToDelete.length} expired usage keys`);
        }
      }

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

      // Batch update apiKeys.lastUsedAt
      // Process in chunks to avoid overly large queries
      const CHUNK_SIZE = 100;
      for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
        const chunk = updates.slice(i, i + CHUNK_SIZE);

        // Use a CASE expression for batch update
        const keyIds = chunk.map((u) => u.keyId);
        const whenClauses = chunk
          .map((u) => `WHEN '${u.keyId}' THEN '${u.lastUsedAt}'::timestamptz`)
          .join(' ');

        await this.db.execute(
          sql`UPDATE api_keys SET last_used_at = CASE id ${sql.raw(whenClauses)} END, updated_at = now() WHERE id IN (${sql.raw(keyIds.map((id) => `'${id}'`).join(','))})`,
        );
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

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async processHourlyBucket(redisKey: string): Promise<void> {
    // Parse the Redis key: keyforge:usage:{keyId}:{hourBucket}
    // e.g. keyforge:usage:key_abc123:2026-03-20T14:00
    const parts = redisKey.split(':');
    if (parts.length < 4) return;

    const keyId = parts[2];
    const hourBucket = parts.slice(3).join(':');
    const period = hourBucket.slice(0, 10); // daily period, e.g. 2026-03-20

    // Fetch all fields from the hash
    const data = await this.redis.hgetall(redisKey);
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
