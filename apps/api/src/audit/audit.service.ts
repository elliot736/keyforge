import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { eq, and, gte, lte, desc, SQL } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { generateId } from '@keyforge/shared';

export interface AuditLogInput {
  workspaceId: string;
  actorId: string;
  actorType: 'user' | 'root_key' | 'system';
  action: string;
  resourceType?: string;
  resourceId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditQueryParams {
  workspaceId: string;
  actorId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  // ─── Log ────────────────────────────────────────────────────────────────────

  /**
   * Write an audit log entry. Fire-and-forget: never blocks the calling request.
   */
  log(params: AuditLogInput): void {
    // Map actorType: the caller uses 'root_key' but the schema enum uses 'api_key'
    const actorType = params.actorType === 'root_key' ? 'api_key' : params.actorType;

    const metadata: Record<string, unknown> = {};
    if (params.before !== undefined) metadata.before = params.before;
    if (params.after !== undefined) metadata.after = params.after;

    this.db
      .insert(schema.auditLog)
      .values({
        id: generateId('aud'),
        workspaceId: params.workspaceId,
        actorId: params.actorId,
        actorType: actorType as 'user' | 'api_key' | 'system',
        action: params.action,
        resourceType: params.resourceType ?? 'unknown',
        resourceId: params.resourceId ?? null,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      })
      .then(() => {
        this.logger.debug(`Audit log written: ${params.action}`);
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to write audit log: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  // ─── Query ──────────────────────────────────────────────────────────────────

  async query(params: AuditQueryParams) {
    const conditions: SQL[] = [
      eq(schema.auditLog.workspaceId, params.workspaceId),
    ];

    if (params.actorId) {
      conditions.push(eq(schema.auditLog.actorId, params.actorId));
    }
    if (params.action) {
      conditions.push(eq(schema.auditLog.action, params.action));
    }
    if (params.resourceType) {
      conditions.push(eq(schema.auditLog.resourceType, params.resourceType));
    }
    if (params.resourceId) {
      conditions.push(eq(schema.auditLog.resourceId, params.resourceId));
    }
    if (params.from) {
      conditions.push(gte(schema.auditLog.timestamp, new Date(params.from)));
    }
    if (params.to) {
      conditions.push(lte(schema.auditLog.timestamp, new Date(params.to)));
    }

    const limit = Math.min(params.limit ?? 50, 100);
    const offset = params.offset ?? 0;

    const whereClause = conditions.length === 1
      ? conditions[0]
      : and(...conditions);

    const entries = await this.db
      .select()
      .from(schema.auditLog)
      .where(whereClause)
      .orderBy(desc(schema.auditLog.timestamp))
      .limit(limit)
      .offset(offset);

    return entries;
  }

  // ─── Get Entry ──────────────────────────────────────────────────────────────

  async getEntry(id: string, workspaceId: string) {
    const [entry] = await this.db
      .select()
      .from(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.id, id),
          eq(schema.auditLog.workspaceId, workspaceId),
        ),
      );

    if (!entry) {
      throw new NotFoundException('Audit log entry not found');
    }

    return entry;
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  /**
   * Delete audit log entries older than the retention period.
   * Intended to be called by a cron job.
   */
  async cleanup(workspaceId: string, retentionDays: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const deleted = await this.db
      .delete(schema.auditLog)
      .where(
        and(
          eq(schema.auditLog.workspaceId, workspaceId),
          lte(schema.auditLog.timestamp, cutoff),
        ),
      )
      .returning({ id: schema.auditLog.id });

    this.logger.log(
      `Cleaned up ${deleted.length} audit log entries older than ${retentionDays} days for workspace ${workspaceId}`,
    );

    return deleted.length;
  }
}
