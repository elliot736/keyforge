import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthService, SessionUser } from '../auth.service';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: SessionUser }>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing session token');
    }

    const user = await this.authService.validateSession(token);
    request.user = user;

    return true;
  }

  private extractToken(request: FastifyRequest): string | null {
    // Try Authorization header first
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Fall back to session cookie
    const cookieHeader = request.headers.cookie;
    if (cookieHeader) {
      const cookies = this.parseCookies(cookieHeader);
      const sessionToken =
        cookies['better-auth.session_token'] ??
        cookies['__Secure-better-auth.session_token'];
      if (sessionToken) {
        return sessionToken;
      }
    }

    return null;
  }

  private parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    for (const pair of cookieHeader.split(';')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const key = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        // Skip malformed cookie values (URIError)
      }
    }
    return cookies;
  }
}
