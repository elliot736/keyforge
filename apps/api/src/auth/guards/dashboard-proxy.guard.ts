import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { SessionUser } from '../auth.service';

/**
 * Guard that trusts the X-Dashboard-User-* headers set by the Next.js proxy.
 * In production, the API and dashboard communicate over a private network
 * (ECS service-to-service) so these headers cannot be forged by external clients.
 * The proxy verifies the session via better-auth before forwarding.
 */
@Injectable()
export class DashboardProxyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: SessionUser }>();

    const userId = request.headers['x-dashboard-user-id'] as string;
    const email = request.headers['x-dashboard-user-email'] as string;
    const name = request.headers['x-dashboard-user-name'] as string;

    if (!userId || !email) {
      throw new UnauthorizedException('Missing dashboard proxy headers');
    }

    request.user = { id: userId, email, name: name || '' };
    return true;
  }
}
