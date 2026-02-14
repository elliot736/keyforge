import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import type { SessionUser } from '../auth.service';

/**
 * Parameter decorator that extracts the current user from the request.
 * Expects the user to have been attached by SessionGuard or CombinedAuthGuard.
 *
 * Usage:
 *   @Get()
 *   getProfile(@CurrentUser() user: SessionUser) { ... }
 *
 *   @Get()
 *   getEmail(@CurrentUser('email') email: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof SessionUser | undefined,
    ctx: ExecutionContext,
  ): SessionUser | string | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: SessionUser }>();
    const user = request.user;

    if (!user) {
      throw new Error(
        'User not found on request. Ensure a session auth guard is applied.',
      );
    }

    return data ? user[data] : user;
  },
);
