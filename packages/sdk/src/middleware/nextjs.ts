import { NextRequest, NextResponse } from 'next/server';
import { KeyForge } from '../client.js';

export interface KeyForgeNextOptions {
  /** A configured KeyForge client instance */
  client: KeyForge;
  /** Custom error handler */
  onError?: (req: NextRequest, error: unknown) => NextResponse | Promise<NextResponse>;
  /** Custom key extraction — defaults to reading the Authorization Bearer header */
  extractKey?: (req: NextRequest) => string | null;
}

/**
 * Next.js middleware helper that verifies API keys via the KeyForge API.
 *
 * Key context (keyId, ownerId, workspaceId, scopes) is forwarded to
 * downstream route handlers via request headers prefixed with `x-keyforge-`.
 */
export function withKeyForge(options: KeyForgeNextOptions) {
  return async (req: NextRequest): Promise<NextResponse | null> => {
    const key =
      options.extractKey?.(req) ??
      req.headers.get('authorization')?.replace('Bearer ', '') ??
      null;

    if (!key) {
      if (options.onError) return options.onError(req, { code: 'MISSING_KEY' });
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
    }

    try {
      const result = await options.client.keys.verify({ key });

      if (!result.valid) {
        const status = result.code === 'RATE_LIMITED' ? 429 : 403;
        if (options.onError) return options.onError(req, result);
        return NextResponse.json({ error: result.code }, { status });
      }

      // Pass key context via headers to downstream route handlers
      const headers = new Headers(req.headers);
      headers.set('x-keyforge-key-id', result.keyId || '');
      headers.set('x-keyforge-owner-id', result.ownerId || '');
      headers.set('x-keyforge-workspace-id', result.workspaceId || '');
      headers.set('x-keyforge-scopes', JSON.stringify(result.scopes || []));

      const response = NextResponse.next({ request: { headers } });

      if (result.rateLimit) {
        response.headers.set('X-RateLimit-Limit', String(result.rateLimit.limit));
        response.headers.set('X-RateLimit-Remaining', String(result.rateLimit.remaining));
        response.headers.set('X-RateLimit-Reset', String(result.rateLimit.reset));
      }

      return response;
    } catch (err) {
      if (options.onError) return options.onError(req, err);
      return NextResponse.json({ error: 'Internal verification error' }, { status: 500 });
    }
  };
}
