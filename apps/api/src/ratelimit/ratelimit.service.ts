import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { FIXED_WINDOW_LUA, SLIDING_WINDOW_LUA, TOKEN_BUCKET_LUA } from './lua/scripts';

// ─── Types ──────────────────────────────────────────────────────────────────

export type RateLimitAlgorithm = 'fixed_window' | 'sliding_window' | 'token_bucket';

export interface RateLimitConfig {
  /** Algorithm to use for rate limiting. */
  algorithm: RateLimitAlgorithm;
  /** Maximum number of requests (or tokens for token_bucket) in the window. */
  limit: number;
  /** Window size in milliseconds (used by fixed_window and sliding_window). */
  window?: number;
  /** Refill rate in tokens per second (used by token_bucket). */
  refillRate?: number;
  /** Tokens to consume per request (used by token_bucket, defaults to 1). */
  consume?: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** The configured limit. */
  limit: number;
  /** Remaining requests/tokens in the current window/bucket. */
  remaining: number;
  /** Timestamp (ms since epoch) when the limit resets. */
  reset: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class RateLimitService implements OnModuleInit {
  private readonly logger = new Logger(RateLimitService.name);
  private scripts: Record<string, string> = {};

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    try {
      this.scripts.fixedWindow = (await this.redis.script(
        'LOAD',
        FIXED_WINDOW_LUA,
      )) as string;
      this.scripts.slidingWindow = (await this.redis.script(
        'LOAD',
        SLIDING_WINDOW_LUA,
      )) as string;
      this.scripts.tokenBucket = (await this.redis.script(
        'LOAD',
        TOKEN_BUCKET_LUA,
      )) as string;
      this.logger.log('Lua rate-limit scripts loaded successfully');
    } catch (error) {
      this.logger.error(
        'Failed to load Lua rate-limit scripts — rate limiting will use EVAL fallback',
        error,
      );
    }
  }

  /**
   * Check (and consume) a rate limit for the given key.
   * Dispatches to the correct algorithm based on config.
   */
  async check(keyId: string, config: RateLimitConfig): Promise<RateLimitResult> {
    try {
      switch (config.algorithm) {
        case 'fixed_window':
          return await this.fixedWindow(keyId, config);
        case 'sliding_window':
          return await this.slidingWindow(keyId, config);
        case 'token_bucket':
          return await this.tokenBucket(keyId, config);
        default:
          throw new Error(
            `Unknown rate-limit algorithm: ${(config as any).algorithm}`,
          );
      }
    } catch (error) {
      this.logger.error(
        `Rate limit check failed for key ${keyId}, failing open`,
        error,
      );
      // Fail open — allow the request when Redis is unavailable
      return {
        allowed: true,
        limit: config.limit,
        remaining: config.limit,
        reset: Date.now() + (config.window ?? 60_000),
      };
    }
  }

  // ─── Algorithms ─────────────────────────────────────────────────────────

  private async fixedWindow(
    keyId: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const window = config.window ?? 60_000;
    const redisKey = `ratelimit:fw:${keyId}`;

    const result = await this.evalScript(
      'fixedWindow',
      FIXED_WINDOW_LUA,
      1,
      redisKey,
      String(window),
      String(config.limit),
      String(now),
    );

    return this.parseResult(result);
  }

  private async slidingWindow(
    keyId: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const window = config.window ?? 60_000;
    const redisKey = `ratelimit:sw:${keyId}`;

    const result = await this.evalScript(
      'slidingWindow',
      SLIDING_WINDOW_LUA,
      1,
      redisKey,
      String(window),
      String(config.limit),
      String(now),
    );

    return this.parseResult(result);
  }

  private async tokenBucket(
    keyId: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const refillRate = config.refillRate ?? 10;
    const consume = config.consume ?? 1;
    const redisKey = `ratelimit:tb:${keyId}`;

    const result = await this.evalScript(
      'tokenBucket',
      TOKEN_BUCKET_LUA,
      1,
      redisKey,
      String(config.limit),
      String(refillRate),
      String(now),
      String(consume),
    );

    return this.parseResult(result);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Execute a Lua script via EVALSHA, falling back to EVAL if the script
   * is not cached in Redis (e.g. after a Redis restart).
   */
  private async evalScript(
    scriptName: string,
    scriptSource: string,
    numKeys: number,
    ...args: string[]
  ): Promise<unknown> {
    const sha = this.scripts[scriptName];

    if (sha) {
      try {
        return await this.redis.evalsha(sha, numKeys, ...args);
      } catch (error: any) {
        // NOSCRIPT means Redis flushed the script cache — fall through to EVAL
        if (error?.message?.includes('NOSCRIPT')) {
          this.logger.warn(
            `Script ${scriptName} evicted from Redis cache, falling back to EVAL`,
          );
        } else {
          throw error;
        }
      }
    }

    // Fallback: full EVAL and re-cache the SHA
    const result = await this.redis.eval(scriptSource, numKeys, ...args);

    // Re-cache the SHA for subsequent calls
    try {
      this.scripts[scriptName] = (await this.redis.script(
        'LOAD',
        scriptSource,
      )) as string;
    } catch {
      // Non-critical — next call will EVAL again
    }

    return result;
  }

  /**
   * Parse the [allowed, limit, remaining, reset] array returned by all
   * Lua scripts into a typed RateLimitResult.
   */
  private parseResult(raw: unknown): RateLimitResult {
    const arr = raw as number[];
    return {
      allowed: arr[0] === 1,
      limit: Number(arr[1]),
      remaining: Number(arr[2]),
      reset: Number(arr[3]),
    };
  }
}
