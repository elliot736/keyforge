import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RootKeyGuard } from '../guards/root-key.guard';
import { SessionGuard } from '../guards/session.guard';
import { WorkspaceRoleGuard } from '../guards/workspace-role.guard';

/**
 * Decorator for routes that require root key authentication (SDK / programmatic API consumers).
 * Extracts the Bearer token and validates it as a root key.
 */
export function ApiAuth() {
  return applyDecorators(UseGuards(RootKeyGuard), ApiBearerAuth());
}

/**
 * Decorator for dashboard routes that require session authentication.
 * Validates the session cookie or Authorization header via better-auth.
 */
export function DashboardAuth() {
  return applyDecorators(UseGuards(SessionGuard), ApiBearerAuth());
}

/**
 * Decorator for dashboard routes that require session auth + workspace role check.
 * Applies SessionGuard first, then WorkspaceRoleGuard.
 * Use with @RequireRole('admin') to set the minimum required role.
 */
export function DashboardAuthWithRole() {
  return applyDecorators(
    UseGuards(SessionGuard, WorkspaceRoleGuard),
    ApiBearerAuth(),
  );
}

/**
 * Composite decorator that accepts either root key or session auth.
 * Tries root key first (Bearer token), falls back to session.
 */
export function Auth() {
  return applyDecorators(
    UseGuards(CombinedAuthGuard),
    ApiBearerAuth(),
  );
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService, SessionUser, RootKeyContext } from '../auth.service';
import { FastifyRequest } from 'fastify';

@Injectable()
export class CombinedAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: SessionUser; rootKey?: RootKeyContext; workspace?: { id: string; role: string } }>();

    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // Try root key first
    if (token) {
      try {
        const rootKeyContext = await this.authService.validateRootKey(token);
        request.rootKey = rootKeyContext;
        request.workspace = {
          id: rootKeyContext.workspaceId,
          role: 'root_key',
        };
        return true;
      } catch {
        // Not a valid root key, try session
      }
    }

    // Try session token (from header or cookie)
    const sessionToken = token ?? this.extractSessionCookie(request);
    if (sessionToken) {
      try {
        const user = await this.authService.validateSession(sessionToken);
        request.user = user;
        return true;
      } catch {
        // Session invalid too
      }
    }

    throw new UnauthorizedException(
      'Authentication required. Provide a valid root key or session token.',
    );
  }

  private extractSessionCookie(request: FastifyRequest): string | null {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return null;

    for (const pair of cookieHeader.split(';')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const key = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      if (
        key === 'better-auth.session_token' ||
        key === '__Secure-better-auth.session_token'
      ) {
        return decodeURIComponent(value);
      }
    }
    return null;
  }
}
