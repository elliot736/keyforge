import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

export interface WorkspaceContext {
  id: string;
  role: string;
}

/**
 * Parameter decorator that extracts the current workspace from the request.
 * Expects the workspace to have been attached by an auth guard or middleware.
 *
 * Usage:
 *   @Get()
 *   getKeys(@CurrentWorkspace() workspace: WorkspaceContext) { ... }
 */
export const CurrentWorkspace = createParamDecorator(
  (data: keyof WorkspaceContext | undefined, ctx: ExecutionContext): WorkspaceContext | string => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { workspace: WorkspaceContext }>();
    const workspace = request.workspace;

    if (!workspace) {
      throw new Error('Workspace not found on request. Ensure an auth guard is applied.');
    }

    return data ? workspace[data] : workspace;
  },
);
