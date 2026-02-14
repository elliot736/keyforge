import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { AuthService, RootKeyContext } from '../auth.service';

@Injectable()
export class RootKeyGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { rootKey?: RootKeyContext; workspace?: { id: string; role: string } }>();

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7);
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const rootKeyContext = await this.authService.validateRootKey(token);

    // Attach root key context and workspace context to the request
    request.rootKey = rootKeyContext;
    request.workspace = {
      id: rootKeyContext.workspaceId,
      role: 'root_key',
    };

    return true;
  }
}
