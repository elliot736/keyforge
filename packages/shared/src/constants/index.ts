export const KEY_PREFIXES = {
  default: 'sk',
  live: 'sk_live',
  test: 'sk_test',
} as const;

export const PLANS = {
  free: { name: 'Free', maxKeys: 100, maxVerificationsPerMonth: 100_000, maxWebhooks: 3, rateLimitPerMinute: 100, tokenBudget: 1_000_000, auditRetentionDays: 30 },
  pro: { name: 'Pro', maxKeys: 1_000, maxVerificationsPerMonth: 10_000_000, maxWebhooks: 10, rateLimitPerMinute: 10_000, tokenBudget: 100_000_000, auditRetentionDays: 365 },
  enterprise: { name: 'Enterprise', maxKeys: -1, maxVerificationsPerMonth: -1, maxWebhooks: -1, rateLimitPerMinute: -1, tokenBudget: -1, auditRetentionDays: -1 },
} as const;

export const WEBHOOK_EVENTS = [
  'key.created',
  'key.revoked',
  'key.expired',
  'key.rotated',
  'key.rate_limited',
  'quota.warning',
  'quota.exceeded',
  'usage.report',
] as const;

export const ERROR_CODES = {
  KEY_NOT_FOUND: 'KEY_NOT_FOUND',
  KEY_REVOKED: 'KEY_REVOKED',
  KEY_EXPIRED: 'KEY_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  SPEND_CAP_EXCEEDED: 'SPEND_CAP_EXCEEDED',
  INVALID_KEY: 'INVALID_KEY',
  FORBIDDEN: 'FORBIDDEN',
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
} as const;

export const RATE_LIMIT_ALGORITHMS = [
  'fixed_window',
  'sliding_window',
  'token_bucket',
] as const;

export const DEFAULT_RATE_LIMIT = {
  algorithm: 'sliding_window',
  limit: 100,
  window: 60000,
} as const;

export const ENVIRONMENTS = [
  'development',
  'staging',
  'production',
] as const;
