import type { Context, MiddlewareHandler } from 'hono';
import type { VerifyKeyResponse } from '@keyforge/shared';
import { KeyForge } from '../client.js';

export interface KeyForgeHonoOptions {
  /** A configured KeyForge client instance */
  client: KeyForge;
  /** Custom error handler */
  onError?: (c: Context, error: unknown) => Response | Promise<Response>;
  /** Custom key extraction — defaults to reading the Authorization Bearer header */
  extractKey?: (c: Context) => string | null;
}

// Augment Hono's variable map so `c.get('keyforge')` is typed
declare module 'hono' {
  interface ContextVariableMap {
    keyforge: VerifyKeyResponse;
  }
}

/**
 * Hono middleware that verifies API keys via the KeyForge API.
 *
 * On success the verified key metadata is available via `c.get('keyforge')`.
 */
export function keyforgeMiddleware(options: KeyForgeHonoOptions): MiddlewareHandler {
  return async (c, next) => {
    const key =
      options.extractKey?.(c) ??
      c.req.header('authorization')?.replace('Bearer ', '') ??
      null;

    if (!key) {
      if (options.onError) return options.onError(c, { code: 'MISSING_KEY' });
      return c.json({ error: 'Missing API key' }, 401);
    }

    try {
      const result = await options.client.keys.verify({ key });

      if (!result.valid) {
        const status = result.code === 'RATE_LIMITED' ? 429 : 403;
        if (options.onError) return options.onError(c, result);
        return c.json({ error: result.code }, status);
      }

      if (result.rateLimit) {
        c.header('X-RateLimit-Limit', String(result.rateLimit.limit));
        c.header('X-RateLimit-Remaining', String(result.rateLimit.remaining));
        c.header('X-RateLimit-Reset', String(result.rateLimit.reset));
      }

      c.set('keyforge', result);
      await next();
    } catch (err) {
      if (options.onError) return options.onError(c, err);
      return c.json({ error: 'Internal verification error' }, 500);
    }
  };
}
