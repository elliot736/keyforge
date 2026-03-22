import type {
  CreateKeyInput,
  VerifyKeyResponse,
  UpdateKeyInput,
  ApiKeyObject,
  ReportUsageInput,
  GetUsageInput,
  ModelBreakdown,
  TokenTrend,
  CostProjection,
} from '@keyforge/shared';

// Usage types not yet exported from shared — define locally
export interface UsageDataPoint {
  timestamp: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface UsageStats {
  dataPoints: UsageDataPoint[];
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
}

export interface WorkspaceUsageSummary {
  workspaceId: string;
  period: string;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  keyCount: number;
  topKeys: Array<{
    keyId: string;
    name: string | null;
    requests: number;
    tokens: number;
    cost: number;
  }>;
}

export interface KeyForgeConfig {
  /** Base URL of the KeyForge API (e.g. "https://api.keyforge.dev") */
  apiUrl: string;
  /** Root key used to authenticate management API calls */
  rootKey: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Retry configuration for transient failures (default: { attempts: 2, delay: 200 }) */
  retry?: { attempts: number; delay: number };
}

type RequiredConfig = Required<KeyForgeConfig>;

export class KeyForge {
  private config: RequiredConfig;

  constructor(config: KeyForgeConfig) {
    if (!config.apiUrl) throw new Error('KeyForge: apiUrl is required');
    if (!config.rootKey) throw new Error('KeyForge: rootKey is required');

    this.config = {
      apiUrl: config.apiUrl.replace(/\/+$/, ''), // strip trailing slash
      rootKey: config.rootKey,
      timeout: config.timeout ?? 10000,
      retry: config.retry ?? { attempts: 2, delay: 200 },
    };
  }

  // ── Key management ───────────────────────────────────────────────────

  readonly keys = {
    /** Create a new API key */
    create: (input: CreateKeyInput) =>
      this.request<{ key: string; keyId: string }>('POST', '/v1/keys.createKey', input),

    /** Verify an API key and return its metadata + rate-limit state */
    verify: (input: { key: string; model?: string }) =>
      this.request<VerifyKeyResponse>('POST', '/v1/keys.verifyKey', input),

    /** Revoke an API key, optionally with a grace period */
    revoke: (input: { keyId: string; gracePeriodMs?: number }) =>
      this.request<void>('POST', '/v1/keys.revokeKey', input),

    /** Rotate an API key, returning the new key while the old one remains valid for the grace period */
    rotate: (input: { keyId: string; gracePeriodMs?: number }) =>
      this.request<{ key: string; keyId: string }>('POST', '/v1/keys.rotateKey', input),

    /** List API keys with optional filters */
    list: (input?: { ownerId?: string; environment?: string; limit?: number; offset?: number }) =>
      this.request<{ keys: ApiKeyObject[]; total: number }>('GET', '/v1/keys', undefined, input),

    /** Get a single API key by ID */
    get: (keyId: string) =>
      this.request<ApiKeyObject>('GET', `/v1/keys/${keyId}`),

    /** Update an API key's mutable fields */
    update: (keyId: string, input: UpdateKeyInput) =>
      this.request<ApiKeyObject>('PATCH', `/v1/keys/${keyId}`, input),
  };

  // ── Usage tracking ───────────────────────────────────────────────────

  readonly usage = {
    /** Report usage for an API key (token counts, model, cost) */
    report: (input: ReportUsageInput) =>
      this.request<void>('POST', '/v1/usage.report', input),

    /** Get usage statistics with time-series data */
    get: (input: GetUsageInput) =>
      this.request<UsageStats>('GET', '/v1/usage', undefined, input as Record<string, unknown>),

    /** Get a high-level usage summary for a workspace */
    summary: (workspaceId: string) =>
      this.request<WorkspaceUsageSummary>('GET', '/v1/usage/summary', undefined, { workspaceId }),
  };

  // ── Analytics ──────────────────────────────────────────────────────

  readonly analytics = {
    /** Get cost and token breakdown by model */
    models: (params: { from: string; to: string }) =>
      this.request<ModelBreakdown[]>('GET', '/v1/analytics/models', undefined, params as Record<string, unknown>),

    /** Get token input/output trends over time */
    tokenTrends: (params: { from: string; to: string; granularity?: string }) =>
      this.request<TokenTrend[]>('GET', '/v1/analytics/tokens', undefined, params as Record<string, unknown>),

    /** Get projected monthly cost based on current spending */
    projection: () =>
      this.request<CostProjection>('GET', '/v1/analytics/projection'),
  };

  // ── Internal request helper ──────────────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ): Promise<T> {
    let url = `${this.config.apiUrl}${path}`;

    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    let lastError: Error | null = null;
    const maxAttempts = this.config.retry.attempts + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        const headers: Record<string, string> = {
          'Authorization': `Bearer ${this.config.rootKey}`,
          'User-Agent': 'keyforge-sdk/0.1.0',
        };
        if (body) {
          headers['Content-Type'] = 'application/json';
        }

        const res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({})) as Record<string, unknown>;
          throw new KeyForgeError(
            (errBody.code as string) || 'UNKNOWN_ERROR',
            (errBody.message as string) || res.statusText,
            res.status,
          );
        }

        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      } catch (err) {
        lastError = err as Error;

        // Don't retry client errors (4xx)
        if (err instanceof KeyForgeError && err.status < 500) throw err;

        if (attempt < maxAttempts - 1) {
          await new Promise<void>((r) => setTimeout(r, this.config.retry.delay * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError;
  }
}

export class KeyForgeError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'KeyForgeError';
    this.code = code;
    this.status = status;

    // Maintain proper prototype chain in TS
    Object.setPrototypeOf(this, KeyForgeError.prototype);
  }
}
