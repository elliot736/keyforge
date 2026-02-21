import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth-server';
import { headers } from 'next/headers';

const API_URL = process.env.API_URL || 'http://localhost:4000';

async function proxyRequest(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;

  // Verify session
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: 'Not authenticated' },
      { status: 401 },
    );
  }

  const apiPath = `/v1/${path.join('/')}`;
  const url = new URL(apiPath, API_URL);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  // Forward the request to the API with internal auth header
  const body = req.method !== 'GET' && req.method !== 'HEAD'
    ? await req.text()
    : undefined;

  const apiRes = await fetch(url.toString(), {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'X-Dashboard-User-Id': session.user.id,
      'X-Dashboard-User-Email': session.user.email,
      'X-Dashboard-User-Name': session.user.name || '',
    },
    body,
  });

  const responseBody = await apiRes.text();

  return new NextResponse(responseBody, {
    status: apiRes.status,
    headers: {
      'Content-Type': apiRes.headers.get('Content-Type') || 'application/json',
    },
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PATCH = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
