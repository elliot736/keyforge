import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { AuthService, SessionUser } from '../auth.service';

export const REQUIRED_ROLE_KEY = 'requiredRole';

/**
 * Decorator to set the minimum required workspace role for a route.
 * Role hierarchy: owner > admin > member > viewer
 */
export const RequireRole = (role: string) =>
  SetMetadata(REQUIRED_ROLE_KEY, role);

const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRED_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no role is required, allow access
    if (!requiredRole) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: SessionUser; workspace?: { id: string; role: string } }>();

    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Extract workspaceId from route params
    const params = (request.params as Record<string, string>) ?? {};
    const workspaceId = params.id ?? params.workspaceId;
    if (!workspaceId) {
      throw new ForbiddenException('Workspace ID not found in request');
    }

    const userRole = await this.authService.getWorkspaceRole(
      workspaceId,
      user.id,
    );

    if (!userRole) {
      throw new ForbiddenException('You are not a member of this workspace');
    }

    const userRoleLevel = ROLE_HIERARCHY[userRole] ?? -1;
    const requiredRoleLevel = ROLE_HIERARCHY[requiredRole] ?? Infinity;

    if (userRoleLevel < requiredRoleLevel) {
      throw new ForbiddenException(
        `Insufficient permissions. Required role: ${requiredRole}, your role: ${userRole}`,
      );
    }

    // Attach workspace context to request
    request.workspace = { id: workspaceId, role: userRole };

    return true;
  }
}
