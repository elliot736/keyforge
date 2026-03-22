import { Injectable, Inject } from '@nestjs/common';
import { sql, eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import type { ModelBreakdown, TokenTrend, CostProjection } from '@keyforge/shared';

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  // ─── Model Cost Breakdown ──────────────────────────────────────────────────

  async getModelBreakdown(
    workspaceId: string,
    from: string,
    to: string,
    keyId?: string,
  ): Promise<ModelBreakdown[]> {
    const conditions = [
      eq(schema.usageRecords.workspaceId, workspaceId),
      sql`${schema.usageRecords.createdAt} >= ${from}::timestamptz`,
      sql`${schema.usageRecords.createdAt} <= ${to}::timestamptz`,
      sql`${schema.usageRecords.model} IS NOT NULL`,
    ];

    if (keyId) {
      conditions.push(eq(schema.usageRecords.keyId, keyId));
    }

    const rows = await this.db
      .select({
        model: schema.usageRecords.model,
        tokensInput: sql<number>`COALESCE(sum(${schema.usageRecords.tokensInput}), 0)::int`.as('tokens_input'),
        tokensOutput: sql<number>`COALESCE(sum(${schema.usageRecords.tokensOutput}), 0)::int`.as('tokens_output'),
        costCents: sql<number>`COALESCE(sum(${schema.usageRecords.costCents}), 0)::int`.as('cost_cents'),
        requestCount: sql<number>`COALESCE(sum(${schema.usageRecords.verifications}), 0)::int`.as('request_count'),
      })
      .from(schema.usageRecords)
      .where(and(...conditions))
      .groupBy(schema.usageRecords.model)
      .orderBy(sql`cost_cents DESC`);

    return rows.map((row) => {
      const totalTokens = (row.tokensInput ?? 0) + (row.tokensOutput ?? 0);
      return {
        model: row.model!,
        tokensInput: row.tokensInput ?? 0,
        tokensOutput: row.tokensOutput ?? 0,
        costCents: row.costCents ?? 0,
        requestCount: row.requestCount ?? 0,
        costPer1kTokens: totalTokens > 0 ? (row.costCents / totalTokens) * 1000 : 0,
      };
    });
  }

  // ─── Token I/O Trend ───────────────────────────────────────────────────────

  async getTokenIOTrend(
    workspaceId: string,
    from: string,
    to: string,
    granularity: 'hour' | 'day' | 'month' = 'day',
  ): Promise<TokenTrend[]> {
    const rows = await this.db
      .select({
        period: sql<string>`date_trunc(${sql.raw(`'${granularity}'`)}, ${schema.usageRecords.createdAt})::text`.as('period'),
        tokensInput: sql<number>`COALESCE(sum(${schema.usageRecords.tokensInput}), 0)::int`.as('tokens_input'),
        tokensOutput: sql<number>`COALESCE(sum(${schema.usageRecords.tokensOutput}), 0)::int`.as('tokens_output'),
      })
      .from(schema.usageRecords)
      .where(
        and(
          eq(schema.usageRecords.workspaceId, workspaceId),
          sql`${schema.usageRecords.createdAt} >= ${from}::timestamptz`,
          sql`${schema.usageRecords.createdAt} <= ${to}::timestamptz`,
        ),
      )
      .groupBy(sql`date_trunc(${sql.raw(`'${granularity}'`)}, ${schema.usageRecords.createdAt})`)
      .orderBy(sql`date_trunc(${sql.raw(`'${granularity}'`)}, ${schema.usageRecords.createdAt})`);

    return rows.map((row) => ({
      period: row.period,
      tokensInput: row.tokensInput ?? 0,
      tokensOutput: row.tokensOutput ?? 0,
    }));
  }

  // ─── Cost Projection ──────────────────────────────────────────────────────

  async getCostProjection(workspaceId: string): Promise<CostProjection> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const daysElapsed = Math.max(
      1,
      Math.floor((now.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const daysInMonth = monthEnd.getDate();
    const daysRemaining = daysInMonth - daysElapsed;

    const [row] = await this.db
      .select({
        totalCost: sql<number>`COALESCE(sum(${schema.usageRecords.costCents}), 0)::int`.as('total_cost'),
      })
      .from(schema.usageRecords)
      .where(
        and(
          eq(schema.usageRecords.workspaceId, workspaceId),
          sql`${schema.usageRecords.createdAt} >= ${monthStart.toISOString()}::timestamptz`,
        ),
      );

    const currentMonthCostCents = row?.totalCost ?? 0;
    const dailyAverageCostCents = Math.round(currentMonthCostCents / daysElapsed);
    const projectedMonthCostCents = currentMonthCostCents + dailyAverageCostCents * daysRemaining;

    return {
      currentMonthCostCents,
      projectedMonthCostCents,
      dailyAverageCostCents,
      daysRemaining,
      daysElapsed,
    };
  }
}
