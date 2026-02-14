import {
  Injectable,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq, and, sql, between, desc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { RedisService } from '../redis/redis.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import type { ReportUsageInput, GetUsageInput } from '@keyforge/shared';

interface UsageTimeSeries {
  period: string;
  requests: number;
  tokensInput: number;
  tokensOutput: number;
  costCents: number;
}

interface KeyUsageSummary {
  keyId: string;
  requests: number;
  tokensInput: number;
  tokensOutput: number;
  costCents: number;
}

interface WorkspaceUsageSummary {
  requestsToday: number;
  requestsMonth: number;
  tokensMonth: number;
  costCentsMonth: number;
  topKeys: Array<{ keyId: string; requests: number }>;
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly redis: RedisService,
    private readonly webhooksService: WebhooksService,
    @InjectQueue('usage') private readonly usageQueue: Queue,
  ) {}

  // ─── Report Usage ─────────────────────────────────────────────────────────

  async reportUsage(input: ReportUsageInput): Promise<void> {
    const { keyId, tokens, model, cost } = input;
    const tokensInput = tokens?.input ?? 0;
    const tokensOutput = tokens?.output ?? 0;
    const costCents = cost ? Math.round(cost * 100) : 0;

    const now = new Date();
    const hourBucket = `${now.toISOString().slice(0, 13)}:00`; // e.g. 2026-03-20T14:00
    const month = now.toISOString().slice(0, 7); // e.g. 2026-03

    // Look up the key to get workspaceId for webhook firing
    const keyData = await this.getKeyWorkspaceId(keyId);
    if (!keyData) {
      this.logger.warn(`Usage reported for unknown key: ${keyId}`);
      return;
    }

    const pipeline = this.redis.pipeline();

    // Increment hourly usage hash
    const hourlyKey = `keyforge:usage:${keyId}:${hourBucket}`;
    pipeline.hincrby(hourlyKey, 'requests', 1);
    pipeline.hincrby(hourlyKey, 'tokens_input', tokensInput);
    pipeline.hincrby(hourlyKey, 'tokens_output', tokensOutput);
    pipeline.hincrby(hourlyKey, 'cost_cents', costCents);
    pipeline.expire(hourlyKey, 7200); // 2 hours TTL for hourly buckets

    // Monthly token budget tracking
    const monthTokensKey = `keyforge:usage:tokens:${keyId}:${month}`;
    pipeline.incrby(monthTokensKey, tokensInput + tokensOutput);
    pipeline.expire(monthTokensKey, 2764800); // 32 days

    // Monthly spend cap tracking
    const monthCostKey = `keyforge:usage:cost:${keyId}:${month}`;
    pipeline.incrby(monthCostKey, costCents);
    pipeline.expire(monthCostKey, 2764800); // 32 days

    // Track lastUsedAt in Redis for batch syncing
    pipeline.set(`keyforge:lastused:${keyId}`, now.toISOString());

    await pipeline.exec();

    // Enqueue detailed record for Postgres persistence
    await this.usageQueue.add(
      'persist-usage',
      {
        keyId,
        workspaceId: keyData.workspaceId,
        tokensInput,
        tokensOutput,
        costCents,
        model: model ?? null,
        hourBucket,
        month,
        timestamp: now.toISOString(),
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );

    // Check budget/spend thresholds and fire webhook events
    await this.checkThresholds(keyId, keyData.workspaceId, month, keyData.tokenBudget, keyData.spendCapCents);
  }

  // ─── Get Usage Stats ──────────────────────────────────────────────────────

  async getUsageStats(input: GetUsageInput): Promise<UsageTimeSeries[]> {
    const { workspaceId, keyId, from, to, granularity } = input;

    // Map granularity to date_trunc precision and period format
    let truncPrecision: string;
    switch (granularity) {
      case 'hour':
        truncPrecision = 'hour';
        break;
      case 'month':
        truncPrecision = 'month';
        break;
      case 'day':
      default:
        truncPrecision = 'day';
        break;
    }

    const conditions = [
      eq(schema.usageRecords.workspaceId, workspaceId),
      sql`${schema.usageRecords.createdAt} >= ${new Date(from)}`,
      sql`${schema.usageRecords.createdAt} <= ${new Date(to)}`,
    ];

    if (keyId) {
      conditions.push(eq(schema.usageRecords.keyId, keyId));
    }

    const rows = await this.db
      .select({
        period: sql<string>`date_trunc(${sql.raw(`'${truncPrecision}'`)}, ${schema.usageRecords.createdAt})::text`.as('period'),
        requests: sql<number>`sum(${schema.usageRecords.verifications})::int`.as('requests'),
        successes: sql<number>`sum(${schema.usageRecords.successes})::int`.as('successes'),
        rateLimited: sql<number>`sum(${schema.usageRecords.rateLimited})::int`.as('rate_limited'),
        usageExceeded: sql<number>`sum(${schema.usageRecords.usageExceeded})::int`.as('usage_exceeded'),
      })
      .from(schema.usageRecords)
      .where(and(...conditions))
      .groupBy(sql`date_trunc(${sql.raw(`'${truncPrecision}'`)}, ${schema.usageRecords.createdAt})`)
      .orderBy(sql`date_trunc(${sql.raw(`'${truncPrecision}'`)}, ${schema.usageRecords.createdAt})`);

    // Map to the response shape. Since the usageRecords schema doesn't track tokens/cost columns
    // directly, we return what we have (verifications-based) and supplement with Redis for real-time.
    return rows.map((row) => ({
      period: row.period,
      requests: row.requests ?? 0,
      tokensInput: 0,
      tokensOutput: 0,
      costCents: 0,
    }));
  }

  // ─── Key Usage Summary ────────────────────────────────────────────────────

  async getKeyUsageSummary(keyId: string): Promise<KeyUsageSummary> {
    const now = new Date();
    const month = now.toISOString().slice(0, 7);

    // Read from Redis counters for real-time data
    const pipeline = this.redis.pipeline();
    pipeline.get(`keyforge:usage:tokens:${keyId}:${month}`);
    pipeline.get(`keyforge:usage:cost:${keyId}:${month}`);

    const results = await pipeline.exec();
    const totalTokens = parseInt((results?.[0]?.[1] as string) ?? '0', 10);
    const totalCostCents = parseInt((results?.[1]?.[1] as string) ?? '0', 10);

    // Count requests by scanning hourly keys for this month
    // For efficiency, we'll also check the monthly counters approach
    // Sum up all hourly bucket request counts for this key this month
    let totalRequests = 0;
    let cursor = '0';
    const pattern = `keyforge:usage:${keyId}:${month}*`;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        parseInt(cursor, 10),
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      for (const key of keys) {
        const requests = await this.redis.hget(key, 'requests');
        totalRequests += parseInt(requests ?? '0', 10);
      }
    } while (cursor !== '0');

    return {
      keyId,
      requests: totalRequests,
      tokensInput: 0,  // Would need separate tracking; total tokens available
      tokensOutput: 0,
      costCents: totalCostCents,
    };
  }

  // ─── Workspace Usage Summary ──────────────────────────────────────────────

  async getWorkspaceUsageSummary(workspaceId: string): Promise<WorkspaceUsageSummary> {
    const now = new Date();
    const today = now.toISOString().slice(0, 10); // 2026-03-20
    const month = now.toISOString().slice(0, 7); // 2026-03

    // Get all keys for this workspace
    const keys = await this.db
      .select({ id: schema.apiKeys.id })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.workspaceId, workspaceId));

    let requestsToday = 0;
    let requestsMonth = 0;
    let tokensMonth = 0;
    let costCentsMonth = 0;
    const keyRequestCounts: Array<{ keyId: string; requests: number }> = [];

    for (const key of keys) {
      let keyRequestsMonth = 0;
      let keyRequestsToday = 0;

      // Scan hourly buckets for this key
      let cursor = '0';
      const monthPattern = `keyforge:usage:${key.id}:${month}*`;

      do {
        const [nextCursor, bucketKeys] = await this.redis.scan(
          parseInt(cursor, 10),
          'MATCH',
          monthPattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        for (const bucketKey of bucketKeys) {
          const requests = await this.redis.hget(bucketKey, 'requests');
          const count = parseInt(requests ?? '0', 10);
          keyRequestsMonth += count;

          // Check if this bucket is for today
          if (bucketKey.includes(today)) {
            keyRequestsToday += count;
          }
        }
      } while (cursor !== '0');

      // Monthly tokens and cost
      const monthTokens = await this.redis.get(`keyforge:usage:tokens:${key.id}:${month}`);
      const monthCost = await this.redis.get(`keyforge:usage:cost:${key.id}:${month}`);

      requestsToday += keyRequestsToday;
      requestsMonth += keyRequestsMonth;
      tokensMonth += parseInt(monthTokens ?? '0', 10);
      costCentsMonth += parseInt(monthCost ?? '0', 10);

      keyRequestCounts.push({ keyId: key.id, requests: keyRequestsMonth });
    }

    // Top keys by volume
    const topKeys = keyRequestCounts
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return {
      requestsToday,
      requestsMonth,
      tokensMonth,
      costCentsMonth,
      topKeys,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async getKeyWorkspaceId(
    keyId: string,
  ): Promise<{ workspaceId: string; tokenBudget: number | null; spendCapCents: number | null } | null> {
    const [row] = await this.db
      .select({
        workspaceId: schema.apiKeys.workspaceId,
        metadata: schema.apiKeys.metadata,
      })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.id, keyId))
      .limit(1);

    if (!row) return null;

    const meta = (row.metadata as Record<string, unknown>) ?? {};
    return {
      workspaceId: row.workspaceId,
      tokenBudget: (meta.__tokenBudget as number) ?? null,
      spendCapCents: (meta.__spendCapCents as number) ?? null,
    };
  }

  private async checkThresholds(
    keyId: string,
    workspaceId: string,
    month: string,
    tokenBudget: number | null,
    spendCapCents: number | null,
  ): Promise<void> {
    try {
      if (!tokenBudget && !spendCapCents) return;

      const pipeline = this.redis.pipeline();
      pipeline.get(`keyforge:usage:tokens:${keyId}:${month}`);
      pipeline.get(`keyforge:usage:cost:${keyId}:${month}`);
      const results = await pipeline.exec();

      const currentTokens = parseInt((results?.[0]?.[1] as string) ?? '0', 10);
      const currentCostCents = parseInt((results?.[1]?.[1] as string) ?? '0', 10);

      // Check token budget thresholds
      if (tokenBudget) {
        const tokenPct = (currentTokens / tokenBudget) * 100;
        await this.fireThresholdEvents(keyId, workspaceId, 'token', tokenPct, month);
      }

      // Check spend cap thresholds
      if (spendCapCents) {
        const costPct = (currentCostCents / spendCapCents) * 100;
        await this.fireThresholdEvents(keyId, workspaceId, 'cost', costPct, month);
      }
    } catch (err) {
      this.logger.warn(`Threshold check failed for key ${keyId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async fireThresholdEvents(
    keyId: string,
    workspaceId: string,
    type: 'token' | 'cost',
    percentage: number,
    month: string,
  ): Promise<void> {
    // Use Redis keys to track which threshold notifications we've already sent
    const thresholdKey = `keyforge:threshold:${keyId}:${type}:${month}`;

    if (percentage >= 100) {
      const alreadySent = await this.redis.sismember(thresholdKey, '100');
      if (!alreadySent) {
        await this.redis.sadd(thresholdKey, '100');
        await this.redis.expire(thresholdKey, 2764800);
        this.webhooksService
          .fire(workspaceId, 'quota.exceeded', {
            keyId,
            type,
            percentage: Math.round(percentage),
            month,
          })
          .catch((err) => this.logger.warn(`Webhook fire failed: ${err.message}`));
      }
    } else if (percentage >= 90) {
      const alreadySent = await this.redis.sismember(thresholdKey, '90');
      if (!alreadySent) {
        await this.redis.sadd(thresholdKey, '90');
        await this.redis.expire(thresholdKey, 2764800);
        this.webhooksService
          .fire(workspaceId, 'quota.warning', {
            keyId,
            type,
            percentage: Math.round(percentage),
            month,
          })
          .catch((err) => this.logger.warn(`Webhook fire failed: ${err.message}`));
      }
    } else if (percentage >= 80) {
      const alreadySent = await this.redis.sismember(thresholdKey, '80');
      if (!alreadySent) {
        await this.redis.sadd(thresholdKey, '80');
        await this.redis.expire(thresholdKey, 2764800);
        this.webhooksService
          .fire(workspaceId, 'quota.warning', {
            keyId,
            type,
            percentage: Math.round(percentage),
            month,
          })
          .catch((err) => this.logger.warn(`Webhook fire failed: ${err.message}`));
      }
    }
  }
}
