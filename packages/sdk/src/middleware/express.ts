import type { Request, Response, NextFunction } from 'express';
import type { VerifyKeyResponse } from '@keyforge/shared';
import { KeyForge } from '../client.js';

export interface KeyForgeMiddlewareOptions {
  /** A configured KeyForge client instance */
  client: KeyForge;
  /** Custom error handler — if omitted the middleware returns JSON error responses */
  onError?: (error: unknown, req: Request, res: Response) => void;
  /** Custom key extraction — defaults to reading the Authorization Bearer header */
  extractKey?: (req: Request) => string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      keyforge?: VerifyKeyResponse;
    }
  }
}

/**
 * Express middleware that verifies API keys via the KeyForge API.
 *
 * On success the verified key metadata is attached to `req.keyforge` and
 * rate-limit headers are set on the response.
 */
export function keyforgeMiddleware(options: KeyForgeMiddlewareOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key =
      options.extractKey?.(req) ??
      req.headers.authorization?.replace('Bearer ', '') ??
      null;

    if (!key) {
      if (options.onError) return options.onError({ code: 'MISSING_KEY' }, req, res);
      return res.status(401).json({ error: 'Missing API key' });
    }

    try {
      const result = await options.client.keys.verify({ key });

      if (!result.valid) {
        const status = result.code === 'RATE_LIMITED' ? 429 : 403;
        if (options.onError) return options.onError(result, req, res);
        return res.status(status).json({ error: result.code });
      }

      // Expose rate-limit state to consumers
      if (result.rateLimit) {
        res.set('X-RateLimit-Limit', String(result.rateLimit.limit));
        res.set('X-RateLimit-Remaining', String(result.rateLimit.remaining));
        res.set('X-RateLimit-Reset', String(result.rateLimit.reset));
      }

      req.keyforge = result;
      next();
    } catch (err) {
      if (options.onError) return options.onError(err, req, res);
      return res.status(500).json({ error: 'Internal verification error' });
    }
  };
}
