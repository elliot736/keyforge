import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { DashboardAuthWithRole } from './decorators/auth.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { RequireRole } from './guards/workspace-role.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { SessionUser } from './auth.service';

const createRootKeySchema = z.object({
  name: z.string().min(1).max(255),
  scopes: z.array(z.string()).default([]),
});

type CreateRootKeyInput = z.infer<typeof createRootKeySchema>;

@ApiTags('Auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Create a new root key for a workspace.
   * Requires session auth and admin+ role in the workspace.
   */
  @Post(':workspaceId/root-keys')
  @DashboardAuthWithRole()
  @RequireRole('admin')
  @ApiOperation({ summary: 'Create a root key' })
  @ApiResponse({ status: 201, description: 'Root key created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async createRootKey(
    @Param('workspaceId') workspaceId: string,
    @Body(new ZodValidationPipe(createRootKeySchema)) body: CreateRootKeyInput,
    @CurrentUser() _user: SessionUser,
  ) {
    const result = await this.authService.createRootKey(
      workspaceId,
      body.name,
      body.scopes,
    );

    return {
      data: {
        id: result.id,
        key: result.key,
        prefix: result.prefix,
      },
    };
  }

  /**
   * List root keys for a workspace.
   * Never returns the key hash.
   */
  @Get(':workspaceId/root-keys')
  @DashboardAuthWithRole()
  @RequireRole('admin')
  @ApiOperation({ summary: 'List root keys' })
  @ApiResponse({ status: 200, description: 'Root keys listed' })
  async listRootKeys(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() _user: SessionUser,
  ) {
    const keys = await this.authService.listRootKeys(workspaceId);
    return { data: keys };
  }

  /**
   * Revoke (disable) a root key.
   */
  @Delete(':workspaceId/root-keys/:id')
  @DashboardAuthWithRole()
  @RequireRole('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a root key' })
  @ApiResponse({ status: 204, description: 'Root key revoked' })
  @ApiResponse({ status: 404, description: 'Root key not found' })
  async revokeRootKey(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() _user: SessionUser,
  ) {
    try {
      await this.authService.revokeRootKey(id, workspaceId);
    } catch {
      throw new NotFoundException('Root key not found');
    }
  }
}
