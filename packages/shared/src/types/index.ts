import type { z } from 'zod';
import type * as schemas from '../schemas/index.js';

export type CreateKeyInput = z.infer<typeof schemas.createKeySchema>;
export type VerifyKeyInput = z.infer<typeof schemas.verifyKeySchema>;
export type VerifyKeyResponse = z.infer<typeof schemas.verifyKeyResponseSchema>;
export type RevokeKeyInput = z.infer<typeof schemas.revokeKeySchema>;
export type RotateKeyInput = z.infer<typeof schemas.rotateKeySchema>;
export type UpdateKeyInput = z.infer<typeof schemas.updateKeySchema>;
export type ListKeysInput = z.infer<typeof schemas.listKeysSchema>;
export type ReportUsageInput = z.infer<typeof schemas.reportUsageSchema>;
export type GetUsageInput = z.infer<typeof schemas.getUsageSchema>;
export type CreateWebhookInput = z.infer<typeof schemas.createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof schemas.updateWebhookSchema>;
export type CreateWorkspaceInput = z.infer<typeof schemas.createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof schemas.updateWorkspaceSchema>;
export type InviteMemberInput = z.infer<typeof schemas.inviteMemberSchema>;

// Plan type
export type PlanName = 'free' | 'pro' | 'enterprise';

// Webhook event types
export type WebhookEvent =
  | 'key.created'
  | 'key.revoked'
  | 'key.expired'
  | 'key.rotated'
  | 'key.rate_limited'
  | 'quota.warning'
  | 'quota.exceeded'
  | 'usage.report';

// Rate limit algorithm
export type RateLimitAlgorithm = 'fixed_window' | 'sliding_window' | 'token_bucket';

// Environment
export type Environment = 'development' | 'staging' | 'production';

// Workspace role
export type WorkspaceRole = 'owner' | 'admin' | 'member';

// Key status
export type KeyStatus = 'active' | 'expired' | 'revoked';

// API error response
export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}

// API success response wrapper
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    limit?: number;
    offset?: number;
  };
}

// Rate limit info returned with verification
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
}

// Usage info returned with verification
export interface UsageInfo {
  requests: number;
  tokens: number;
}

// Per-model policy for rate limits, budgets, and access control
export interface ModelPolicy {
  tokenBudget?: number;
  spendCapCents?: number;
  rateLimitMax?: number;
  rateLimitWindow?: number; // seconds
  blocked?: boolean;
}

export type ModelPolicies = Record<string, ModelPolicy>;

// Full key object (for management, never includes raw key)
export interface ApiKeyObject {
  id: string;
  workspaceId: string;
  name: string | null;
  prefix: string;
  ownerId: string | null;
  environment: Environment;
  scopes: string[];
  meta: Record<string, unknown> | null;
  rateLimitConfig: {
    algorithm: RateLimitAlgorithm;
    limit: number;
    window: number;
    burstLimit?: number;
    refillRate?: number;
  } | null;
  tokenBudget: number | null;
  spendCapCents: number | null;
  modelPolicies: ModelPolicies | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

// Analytics response types
export interface ModelBreakdown {
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costCents: number;
  requestCount: number;
  costPer1kTokens: number;
}

export interface TokenTrend {
  period: string;
  tokensInput: number;
  tokensOutput: number;
}

export interface CostProjection {
  currentMonthCostCents: number;
  projectedMonthCostCents: number;
  dailyAverageCostCents: number;
  daysRemaining: number;
  daysElapsed: number;
}

// Webhook object
export interface WebhookObject {
  id: string;
  workspaceId: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

// Audit log entry
export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  actorId: string;
  actorType: 'user' | 'root_key' | 'system';
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  timestamp: string;
}
