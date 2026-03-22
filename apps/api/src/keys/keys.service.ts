import {
  Injectable,
  Inject,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { eq, and, desc, count } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import {
  generateApiKey,
  hashApiKey,
  extractKeyPrefix,
  generateId,
} from '@keyforge/shared';
import type {
  CreateKeyInput,
  UpdateKeyInput,
  ListKeysInput,
  ApiKeyObject,
  RateLimitAlgorithm,
} from '@keyforge/shared';

/** Shape of data cached in Redis for a key. */
interface CachedKeyData {
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
  modelPolicies: Record<string, { tokenBudget?: number; spendCapCents?: number; rateLimitMax?: number; rateLimitWindow?: number; blocked?: boolean }> | null;
}

@Injectable()
export class KeysService {
  private readonly logger = new Logger(KeysService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly redis: RedisService,
    private readonly auditService: AuditService,
    private readonly webhooksService: WebhooksService,
  ) {}

  // ─── Create Key ──────────────────────────────────────────────────────────

  async createKey(
    workspaceId: string,
    input: CreateKeyInput,
    actorId: string,
  ): Promise<{ key: string; keyId: string }> {
    const prefix = input.prefix ?? 'sk';
    const rawKey = generateApiKey(prefix);
    const keyHash = hashApiKey(rawKey);
    const displayPrefix = extractKeyPrefix(rawKey);
    const keyId = generateId('key');

    const rateLimitConfig = input.rateLimitConfig ?? null;

    const [record] = await this.db
      .insert(schema.apiKeys)
      .values({
        id: keyId,
        workspaceId,
        name: input.name,
        keyHash,
        prefix: displayPrefix,
        ownerId: input.ownerId ?? null,
        environment: this.mapEnvironmentToDbEnum(input.environment),
        scopes: input.scopes ?? [],
        metadata: input.meta ?? null,
        rateLimitMax: rateLimitConfig?.limit ?? null,
        rateLimitWindow: rateLimitConfig?.window
          ? Math.floor(rateLimitConfig.window / 1000)
          : null,
        rateLimitRefill: rateLimitConfig?.refillRate ?? null,
        tokenBudget: input.tokenBudget ?? null,
        spendCapCents: input.spendCapCents ?? null,
        modelPolicies: input.modelPolicies ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        enabled: true,
        usageLimit: null,
        usageCount: 0,
        remaining: null,
      })
      .returning();

    if (!record) {
      throw new NotFoundException('Key could not be created');
    }

    // Cache key data in Redis (5-minute TTL)
    const cached = this.buildCachedData(record);
    await this.redis.set(
      `keyforge:key:${keyHash}`,
      JSON.stringify(cached),
      'EX',
      300,
    );

    // Audit log (fire-and-forget)
    this.auditService
      .log({
        workspaceId,
        actorId,
        actorType: 'root_key',
        action: 'key.created',
        resourceType: 'api_key',
        resourceId: keyId,
        metadata: { name: input.name, environment: input.environment },
      })
      .catch((err) =>
        this.logger.warn(`Audit log failed: ${err.message}`),
      );

    // Fire webhook (fire-and-forget)
    this.webhooksService
      .fireEvent(workspaceId, 'key.created', {
        keyId,
        name: input.name,
        environment: input.environment,
        prefix: displayPrefix,
      })
      .catch((err) =>
        this.logger.warn(`Webhook fire failed: ${err.message}`),
      );

    return { key: rawKey, keyId };
  }

  // ─── Get Key ─────────────────────────────────────────────────────────────

  async getKey(keyId: string, workspaceId: string): Promise<ApiKeyObject> {
    const [row] = await this.db
      .select()
      .from(schema.apiKeys)
      .where(
        and(
          eq(schema.apiKeys.id, keyId),
          eq(schema.apiKeys.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException(`Key ${keyId} not found`);
    }

    return this.mapRowToApiKeyObject(row);
  }

  // ─── List Keys ───────────────────────────────────────────────────────────

  async listKeys(
    input: ListKeysInput,
  ): Promise<{ keys: ApiKeyObject[]; total: number }> {
    const conditions = [eq(schema.apiKeys.workspaceId, input.workspaceId)];

    if (input.ownerId) {
      conditions.push(eq(schema.apiKeys.ownerId, input.ownerId));
    }

    if (input.environment) {
      conditions.push(
        eq(
          schema.apiKeys.environment,
          this.mapEnvironmentToDbEnum(input.environment),
        ),
      );
    }

    const whereClause = and(...conditions);

    const [rows, totalResult] = await Promise.all([
      this.db
        .select()
        .from(schema.apiKeys)
        .where(whereClause)
        .orderBy(desc(schema.apiKeys.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      this.db
        .select({ count: count() })
        .from(schema.apiKeys)
        .where(whereClause),
    ]);

    const total = totalResult[0]?.count ?? 0;
    const keys = rows.map((row) => this.mapRowToApiKeyObject(row));

    return { keys, total };
  }

  // ─── Update Key ──────────────────────────────────────────────────────────

  async updateKey(
    keyId: string,
    workspaceId: string,
    input: UpdateKeyInput,
    actorId: string,
  ): Promise<ApiKeyObject> {
    const [existing] = await this.db
      .select()
      .from(schema.apiKeys)
      .where(
        and(
          eq(schema.apiKeys.id, keyId),
          eq(schema.apiKeys.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Key ${keyId} not found`);
    }

    const updateFields: Record<string, unknown> = {};

    if (input.name !== undefined) updateFields.name = input.name;
    if (input.scopes !== undefined) updateFields.scopes = input.scopes;
    if (input.meta !== undefined) updateFields.metadata = input.meta;
    if (input.tokenBudget !== undefined) updateFields.tokenBudget = input.tokenBudget;
    if (input.spendCapCents !== undefined) updateFields.spendCapCents = input.spendCapCents;
    if (input.modelPolicies !== undefined) updateFields.modelPolicies = input.modelPolicies;
    if (input.rateLimitConfig !== undefined) {
      updateFields.rateLimitMax = input.rateLimitConfig.limit;
      updateFields.rateLimitWindow = Math.floor(
        input.rateLimitConfig.window / 1000,
      );
      updateFields.rateLimitRefill = input.rateLimitConfig.refillRate ?? null;
    }
    if (input.expiresAt !== undefined) {
      updateFields.expiresAt =
        input.expiresAt === null ? null : new Date(input.expiresAt);
    }

    const [updated] = await this.db
      .update(schema.apiKeys)
      .set(updateFields)
      .where(eq(schema.apiKeys.id, keyId))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Key ${keyId} not found`);
    }

    // Invalidate Redis cache
    await this.redis.del(`keyforge:key:${existing.keyHash}`);

    // Re-cache with fresh data
    const cached = this.buildCachedData(updated);
    await this.redis.set(
      `keyforge:key:${updated.keyHash}`,
      JSON.stringify(cached),
      'EX',
      300,
    );

    // Audit log
    this.auditService
      .log({
        workspaceId,
        actorId,
        actorType: 'root_key',
        action: 'key.updated',
        resourceType: 'api_key',
        resourceId: keyId,
        metadata: { changes: Object.keys(updateFields) },
      })
      .catch((err) =>
        this.logger.warn(`Audit log failed: ${err.message}`),
      );

    return this.mapRowToApiKeyObject(updated);
  }

  // ─── Revoke Key ──────────────────────────────────────────────────────────

  async revokeKey(
    keyId: string,
    workspaceId: string,
    gracePeriodMs: number,
    actorId: string,
  ): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(schema.apiKeys)
      .where(
        and(
          eq(schema.apiKeys.id, keyId),
          eq(schema.apiKeys.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Key ${keyId} not found`);
    }

    if (existing.revokedAt) {
      throw new HttpException('Key is already revoked', HttpStatus.CONFLICT);
    }

    const revokedAt = new Date(Date.now() + gracePeriodMs);

    await this.db
      .update(schema.apiKeys)
      .set({
        revokedAt,
        revokedReason: 'Revoked via API',
      })
      .where(eq(schema.apiKeys.id, keyId));

    if (gracePeriodMs > 0) {
      // Update cache with revocation info; TTL = grace period
      const cached = this.buildCachedData({
        ...existing,
        revokedAt,
      });
      const ttlSeconds = Math.ceil(gracePeriodMs / 1000);
      await this.redis.set(
        `keyforge:key:${existing.keyHash}`,
        JSON.stringify(cached),
        'EX',
        ttlSeconds,
      );
    } else {
      // No grace period - remove from cache immediately
      await this.redis.del(`keyforge:key:${existing.keyHash}`);
    }

    // Audit log
    this.auditService
      .log({
        workspaceId,
        actorId,
        actorType: 'root_key',
        action: 'key.revoked',
        resourceType: 'api_key',
        resourceId: keyId,
        metadata: { gracePeriodMs },
      })
      .catch((err) =>
        this.logger.warn(`Audit log failed: ${err.message}`),
      );

    // Webhook
    this.webhooksService
      .fireEvent(workspaceId, 'key.revoked', {
        keyId,
        name: existing.name,
        gracePeriodMs,
      })
      .catch((err) =>
        this.logger.warn(`Webhook fire failed: ${err.message}`),
      );
  }

  // ─── Rotate Key ──────────────────────────────────────────────────────────

  async rotateKey(
    keyId: string,
    workspaceId: string,
    gracePeriodMs: number,
    actorId: string,
  ): Promise<{ key: string; keyId: string }> {
    const [existing] = await this.db
      .select()
      .from(schema.apiKeys)
      .where(
        and(
          eq(schema.apiKeys.id, keyId),
          eq(schema.apiKeys.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException(`Key ${keyId} not found`);
    }

    if (existing.revokedAt) {
      throw new HttpException(
        'Cannot rotate a revoked key',
        HttpStatus.CONFLICT,
      );
    }

    // Derive the same key prefix from the old key's display prefix
    // e.g. "sk_live_abc1..." -> use "sk_live" as the prefix for the new key
    const prefixPart = existing.prefix.replace(/\.\.\..*$/, '').replace(/\.\.\.$/, '');
    // Actually, the prefix column stores the display prefix (first ~12 chars + "...").
    // We need to derive the actual prefix used for generation. Let's parse it.
    // The display prefix format is like "sk_Abc12345..." so the actual prefix is everything before the first underscore-followed-by-random.
    // Simplest: use the existing prefix field but strip the trailing "..."
    const rawPrefix = prefixPart.length > 0 ? prefixPart.split('_').slice(0, -1).join('_') || 'sk' : 'sk';
    const newRawKey = generateApiKey(rawPrefix);
    const newKeyHash = hashApiKey(newRawKey);
    const newDisplayPrefix = extractKeyPrefix(newRawKey);
    const newKeyId = generateId('key');

    const revokedAt = new Date(Date.now() + gracePeriodMs);

    // Transaction: revoke old key and insert new one
    await this.db.transaction(async (tx) => {
      // Revoke the old key
      await tx
        .update(schema.apiKeys)
        .set({
          revokedAt,
          revokedReason: 'Rotated',
        })
        .where(eq(schema.apiKeys.id, keyId));

      // Insert new key with same config
      await tx.insert(schema.apiKeys).values({
        id: newKeyId,
        workspaceId: existing.workspaceId,
        name: existing.name,
        keyHash: newKeyHash,
        prefix: newDisplayPrefix,
        ownerId: existing.ownerId,
        environment: existing.environment,
        scopes: existing.scopes,
        metadata: existing.metadata,
        rateLimitMax: existing.rateLimitMax,
        rateLimitWindow: existing.rateLimitWindow,
        rateLimitRefill: existing.rateLimitRefill,
        expiresAt: existing.expiresAt,
        enabled: true,
        usageLimit: existing.usageLimit,
        usageCount: 0,
        remaining: existing.remaining,
      });
    });

    // Cache the new key
    const newRow = await this.db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.id, newKeyId))
      .limit(1)
      .then((rows) => rows[0]);

    if (newRow) {
      const cached = this.buildCachedData(newRow);
      await this.redis.set(
        `keyforge:key:${newKeyHash}`,
        JSON.stringify(cached),
        'EX',
        300,
      );
    }

    // Handle old key cache
    if (gracePeriodMs > 0) {
      // Update old key cache with revocation, set TTL = grace period
      const oldCached = this.buildCachedData({
        ...existing,
        revokedAt,
      });
      const ttlSeconds = Math.ceil(gracePeriodMs / 1000);
      await this.redis.set(
        `keyforge:key:${existing.keyHash}`,
        JSON.stringify(oldCached),
        'EX',
        ttlSeconds,
      );
    } else {
      await this.redis.del(`keyforge:key:${existing.keyHash}`);
    }

    // Audit log
    this.auditService
      .log({
        workspaceId,
        actorId,
        actorType: 'root_key',
        action: 'key.rotated',
        resourceType: 'api_key',
        resourceId: keyId,
        metadata: {
          oldKeyId: keyId,
          newKeyId,
          gracePeriodMs,
        },
      })
      .catch((err) =>
        this.logger.warn(`Audit log failed: ${err.message}`),
      );

    // Webhook
    this.webhooksService
      .fireEvent(workspaceId, 'key.rotated', {
        oldKeyId: keyId,
        newKeyId,
        gracePeriodMs,
      })
      .catch((err) =>
        this.logger.warn(`Webhook fire failed: ${err.message}`),
      );

    return { key: newRawKey, keyId: newKeyId };
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Map the shared environment enum values to the DB enum values.
   * Schema uses 'live' | 'test', while shared uses 'development' | 'staging' | 'production'.
   */
  private mapEnvironmentToDbEnum(
    env: string,
  ): 'live' | 'test' {
    switch (env) {
      case 'production':
      case 'staging':
        return 'live';
      case 'development':
        return 'test';
      default:
        return 'live';
    }
  }

  private buildCachedData(
    row: typeof schema.apiKeys.$inferSelect,
  ): CachedKeyData {
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
      tokenBudget: row.tokenBudget ?? null,
      spendCapCents: row.spendCapCents ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      enabled: row.enabled,
      usageLimit: row.usageLimit,
      remaining: row.remaining,
      modelPolicies: row.modelPolicies ?? null,
    };
  }

  private mapRowToApiKeyObject(
    row: typeof schema.apiKeys.$inferSelect,
  ): ApiKeyObject {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      prefix: row.prefix,
      ownerId: row.ownerId,
      environment: row.environment === 'test' ? 'development' : 'production',
      scopes: row.scopes ?? [],
      meta: row.metadata ?? null,
      rateLimitConfig:
        row.rateLimitMax != null
          ? {
              algorithm: ((row as Record<string, unknown>).rateLimitAlgorithm as RateLimitAlgorithm) ?? 'sliding_window',
              limit: row.rateLimitMax,
              window: (row.rateLimitWindow ?? 60) * 1000,
              refillRate: row.rateLimitRefill ?? undefined,
            }
          : null,
      tokenBudget: row.tokenBudget ?? null,
      spendCapCents: row.spendCapCents ?? null,
      modelPolicies: row.modelPolicies ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
