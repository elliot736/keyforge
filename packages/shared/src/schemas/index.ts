import { z } from 'zod';

// ---- Keys ----
export const createKeySchema = z.object({
  name: z.string().min(1).max(255),
  prefix: z.string().min(1).max(20).optional(),
  ownerId: z.string().optional(),
  environment: z.enum(['development', 'staging', 'production']).default('production'),
  scopes: z.array(z.string()).default([]),
  meta: z.record(z.unknown()).optional(),
  rateLimitConfig: z.object({
    algorithm: z.enum(['fixed_window', 'sliding_window', 'token_bucket']),
    limit: z.number().int().positive(),
    window: z.number().int().positive(), // ms
    burstLimit: z.number().int().positive().optional(), // for token_bucket
    refillRate: z.number().positive().optional(), // for token_bucket
  }).optional(),
  tokenBudget: z.number().int().positive().optional(),
  spendCapCents: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const verifyKeySchema = z.object({
  key: z.string().min(1),
});

export const verifyKeyResponseSchema = z.object({
  valid: z.boolean(),
  code: z.string().optional(),
  keyId: z.string().optional(),
  ownerId: z.string().nullable().optional(),
  workspaceId: z.string().optional(),
  name: z.string().nullable().optional(),
  environment: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  meta: z.record(z.unknown()).nullable().optional(),
  rateLimit: z.object({
    limit: z.number(),
    remaining: z.number(),
    reset: z.number(),
  }).optional(),
  usage: z.object({
    requests: z.number(),
    tokens: z.number(),
  }).optional(),
});

export const revokeKeySchema = z.object({
  keyId: z.string().min(1),
  gracePeriodMs: z.number().int().min(0).default(0),
});

export const rotateKeySchema = z.object({
  keyId: z.string().min(1),
  gracePeriodMs: z.number().int().min(0).default(300000), // 5 min default
});

export const updateKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  scopes: z.array(z.string()).optional(),
  meta: z.record(z.unknown()).optional(),
  rateLimitConfig: z.object({
    algorithm: z.enum(['fixed_window', 'sliding_window', 'token_bucket']),
    limit: z.number().int().positive(),
    window: z.number().int().positive(),
    burstLimit: z.number().int().positive().optional(),
    refillRate: z.number().positive().optional(),
  }).optional(),
  tokenBudget: z.number().int().positive().optional(),
  spendCapCents: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const listKeysSchema = z.object({
  workspaceId: z.string(),
  ownerId: z.string().optional(),
  environment: z.enum(['development', 'staging', 'production']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

// ---- Usage ----
export const reportUsageSchema = z.object({
  keyId: z.string().min(1),
  tokens: z.object({
    input: z.number().int().min(0).default(0),
    output: z.number().int().min(0).default(0),
  }).optional(),
  model: z.string().optional(),
  cost: z.number().min(0).optional(),
});

export const getUsageSchema = z.object({
  workspaceId: z.string(),
  keyId: z.string().optional(),
  model: z.string().optional(),
  environment: z.string().optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  granularity: z.enum(['hour', 'day', 'month']).default('day'),
});

// ---- Webhooks ----
export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
});

export const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

// ---- Workspaces ----
export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  plan: z.enum(['free', 'pro', 'enterprise']).default('free'),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
});
