import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { generateId } from '@keyforge/shared';

interface UsageJobData {
  keyId: string;
  workspaceId: string;
  tokensInput: number;
  tokensOutput: number;
  costCents: number;
  model: string | null;
  hourBucket: string;
  month: string;
  timestamp: string;
}

/** Buffer for batching inserts. */
const insertBuffer: UsageJobData[] = [];
const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 5000;

@Processor('usage')
export class UsageProcessor extends WorkerHost {
  private readonly logger = new Logger(UsageProcessor.name);
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {
    super();
    // Periodically flush any remaining items in the buffer
    this.flushTimer = setInterval(() => {
      if (insertBuffer.length > 0) {
        this.flushBuffer().catch((err) =>
          this.logger.error(`Buffer flush failed: ${err.message}`),
        );
      }
    }, FLUSH_INTERVAL_MS);
  }

  async process(job: Job<UsageJobData>): Promise<void> {
    insertBuffer.push(job.data);

    if (insertBuffer.length >= BATCH_SIZE) {
      await this.flushBuffer();
    }
  }

  private async flushBuffer(): Promise<void> {
    if (insertBuffer.length === 0) return;

    // Drain the buffer
    const batch = insertBuffer.splice(0, insertBuffer.length);

    try {
      // Group by keyId + period (daily) for upsert
      const grouped = new Map<
        string,
        {
          keyId: string;
          workspaceId: string;
          period: string;
          verifications: number;
          successes: number;
        }
      >();

      for (const item of batch) {
        // Use daily period for the usage_records table
        const period = item.timestamp.slice(0, 10); // e.g. 2026-03-20
        const groupKey = `${item.keyId}:${period}`;

        const existing = grouped.get(groupKey);
        if (existing) {
          existing.verifications += 1;
          existing.successes += 1;
        } else {
          grouped.set(groupKey, {
            keyId: item.keyId,
            workspaceId: item.workspaceId,
            period,
            verifications: 1,
            successes: 1,
          });
        }
      }

      // Upsert each group into usage_records
      const values = Array.from(grouped.values()).map((g) => ({
        id: generateId('usage'),
        keyId: g.keyId,
        workspaceId: g.workspaceId,
        period: g.period,
        verifications: g.verifications,
        successes: g.successes,
        rateLimited: 0,
        usageExceeded: 0,
      }));

      if (values.length > 0) {
        await this.db
          .insert(schema.usageRecords)
          .values(values)
          .onConflictDoUpdate({
            target: [schema.usageRecords.id],
            set: {
              verifications: sql`${schema.usageRecords.verifications} + excluded.verifications`,
              successes: sql`${schema.usageRecords.successes} + excluded.successes`,
              updatedAt: sql`now()`,
            },
          });
      }

      this.logger.debug(`Flushed ${batch.length} usage events (${values.length} upserts)`);
    } catch (err) {
      // Put items back into the buffer for retry
      insertBuffer.unshift(...batch);
      this.logger.error(
        `Failed to flush usage buffer: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err; // Let BullMQ handle the retry
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    // Final flush
    await this.flushBuffer();
  }
}
