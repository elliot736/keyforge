import { NextRequest, NextResponse } from 'next/server';

// ─── In-memory rate limiter for auth endpoints ─────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per window per IP

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Periodic cleanup to prevent memory leaks (runs at most once per window)
let lastCleanup = Date.now();

function cleanupRateLimitMap() {
  const now = Date.now();
  if (now - lastCleanup < RATE_LIMIT_WINDOW_MS) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (entry.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}

function isRateLimited(ip: string): { limited: boolean; remaining: number; resetAt: number } {
  cleanupRateLimitMap();

  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || entry.resetAt <= now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { limited: false, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  entry.count += 1;

  if (entry.count > RATE_LIMIT_MAX) {
    return { limited: true, remaining: 0, resetAt: entry.resetAt };
  }

  return { limited: false, remaining: RATE_LIMIT_MAX - entry.count, resetAt: entry.resetAt };
}

// ─── Middleware ─────────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate-limit auth API routes to prevent brute force
  if (pathname.startsWith('/api/auth')) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.ip ||
      'unknown';

    const { limited, remaining, resetAt } = isRateLimited(ip);

    if (limited) {
      return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
        },
      });
    }

    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
    return response;
  }

  // Session-based redirect logic for non-API routes
  const sessionToken = request.cookies.get('better-auth.session_token')?.value;
  const isAuthPage =
    pathname.startsWith('/login') ||
    pathname.startsWith('/register');

  if (!sessionToken && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (sessionToken && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/auth/(.*)', '/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
