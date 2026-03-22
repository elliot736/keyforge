import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  primaryKey,
  bigint,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Helpers ────────────────────────────────────────────────────────────────

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

// ─── Workspaces ─────────────────────────────────────────────────────────────

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(), // ws_xxx
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan', { enum: ['free', 'pro', 'enterprise'] }).notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  billingEmail: text('billing_email'),
  enabled: boolean('enabled').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  ...timestamps,
});

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  apiKeys: many(apiKeys),
  webhookEndpoints: many(webhookEndpoints),
  auditLogs: many(auditLog),
  rootKeys: many(rootKeys),
}));

// ─── Workspace Members ──────────────────────────────────────────────────────

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role', { enum: ['owner', 'admin', 'member', 'viewer'] }).notNull().default('member'),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
  ],
);

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
}));

// ─── API Keys ───────────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(), // key_xxx
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    keyHash: text('key_hash').notNull().unique(),
    prefix: varchar('prefix', { length: 16 }).notNull(),
    ownerId: text('owner_id'),
    environment: text('environment', { enum: ['live', 'test'] }).notNull().default('live'),

    // Permissions & scoping
    scopes: jsonb('scopes').$type<string[]>(),
    permissions: jsonb('permissions').$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    // Rate limiting (request-based)
    rateLimitMax: integer('rate_limit_max'),
    rateLimitWindow: integer('rate_limit_window'), // seconds
    rateLimitRefill: integer('rate_limit_refill'),

    // Token/spend budgets (for LLM/AI APIs)
    tokenBudget: bigint('token_budget', { mode: 'number' }),
    spendCapCents: integer('spend_cap_cents'),
    modelPolicies: jsonb('model_policies').$type<Record<string, { tokenBudget?: number; spendCapCents?: number; rateLimitMax?: number; rateLimitWindow?: number; blocked?: boolean }>>(),

    // Expiration & usage limits
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    usageLimit: integer('usage_limit'),
    usageCount: integer('usage_count').notNull().default(0),
    remaining: integer('remaining'),

    // Status
    enabled: boolean('enabled').notNull().default(true),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),

    ...timestamps,
  },
  (table) => [
    index('api_keys_key_hash_idx').on(table.keyHash),
    index('api_keys_workspace_id_idx').on(table.workspaceId),
    index('api_keys_owner_id_idx').on(table.ownerId),
    index('api_keys_prefix_idx').on(table.prefix),
  ],
);

export const apiKeysRelations = relations(apiKeys, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [apiKeys.workspaceId],
    references: [workspaces.id],
  }),
  usageRecords: many(usageRecords),
}));

// ─── Usage Records ──────────────────────────────────────────────────────────

export const usageRecords = pgTable(
  'usage_records',
  {
    id: text('id').primaryKey(), // usage_xxx
    keyId: text('key_id').notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    period: text('period').notNull(), // e.g., '2026-03-20T14:00' for hourly buckets
    verifications: bigint('verifications', { mode: 'number' }).notNull().default(0),
    successes: bigint('successes', { mode: 'number' }).notNull().default(0),
    rateLimited: bigint('rate_limited', { mode: 'number' }).notNull().default(0),
    usageExceeded: bigint('usage_exceeded', { mode: 'number' }).notNull().default(0),

    // Token metering (for LLM/AI APIs)
    tokensInput: bigint('tokens_input', { mode: 'number' }).notNull().default(0),
    tokensOutput: bigint('tokens_output', { mode: 'number' }).notNull().default(0),
    costCents: integer('cost_cents').notNull().default(0),
    model: text('model'),
    ...timestamps,
  },
  (table) => [
    index('usage_records_key_period_idx').on(table.keyId, table.period),
    index('usage_records_workspace_period_idx').on(table.workspaceId, table.period),
  ],
);

export const usageRecordsRelations = relations(usageRecords, ({ one }) => ({
  apiKey: one(apiKeys, {
    fields: [usageRecords.keyId],
    references: [apiKeys.id],
  }),
  workspace: one(workspaces, {
    fields: [usageRecords.workspaceId],
    references: [workspaces.id],
  }),
}));

// ─── Webhook Endpoints ──────────────────────────────────────────────────────

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: text('id').primaryKey(), // whep_xxx
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    description: text('description'),
    secret: text('secret').notNull(),
    events: jsonb('events').$type<string[]>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index('webhook_endpoints_workspace_id_idx').on(table.workspaceId),
  ],
);

export const webhookEndpointsRelations = relations(webhookEndpoints, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [webhookEndpoints.workspaceId],
    references: [workspaces.id],
  }),
  deliveries: many(webhookDeliveries),
}));

// ─── Webhook Deliveries ─────────────────────────────────────────────────────

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(), // whdl_xxx
    endpointId: text('endpoint_id').notNull().references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    payload: jsonb('payload').notNull(),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    status: text('status', { enum: ['pending', 'success', 'failed', 'delivering'] }).notNull().default('pending'),
    ...timestamps,
  },
  (table) => [
    index('webhook_deliveries_endpoint_id_idx').on(table.endpointId),
    index('webhook_deliveries_status_idx').on(table.status),
  ],
);

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  endpoint: one(webhookEndpoints, {
    fields: [webhookDeliveries.endpointId],
    references: [webhookEndpoints.id],
  }),
}));

// ─── Audit Log ──────────────────────────────────────────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(), // aud_xxx
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').notNull(),
    actorType: text('actor_type', { enum: ['user', 'api_key', 'system'] }).notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (table) => [
    index('audit_log_workspace_timestamp_idx').on(table.workspaceId, table.timestamp),
    index('audit_log_actor_id_idx').on(table.actorId),
    index('audit_log_resource_idx').on(table.resourceType, table.resourceId),
  ],
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [auditLog.workspaceId],
    references: [workspaces.id],
  }),
}));

// ─── Root Keys (for API authentication) ─────────────────────────────────────

export const rootKeys = pgTable(
  'root_keys',
  {
    id: text('id').primaryKey(), // rk_xxx
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    prefix: varchar('prefix', { length: 16 }).notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('root_keys_key_hash_idx').on(table.keyHash),
    index('root_keys_workspace_id_idx').on(table.workspaceId),
  ],
);

export const rootKeysRelations = relations(rootKeys, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [rootKeys.workspaceId],
    references: [workspaces.id],
  }),
}));
