import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { DashboardProxyGuard } from '../auth/guards/dashboard-proxy.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SessionUser } from '../auth/auth.service';
import { KeysService } from './keys.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  createKeySchema,
  updateKeySchema,
  listKeysSchema,
} from '@keyforge/shared';
import type {
  CreateKeyInput,
  UpdateKeyInput,
  ListKeysInput,
} from '@keyforge/shared';

@ApiTags('dashboard')
@Controller('v1/workspaces/:workspaceSlug/keys')
@UseGuards(DashboardProxyGuard)
export class KeysDashboardController {
  constructor(
    private readonly keysService: KeysService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  /**
   * Resolve a workspace slug to a workspace record and verify that the
   * authenticated user is a member.
   */
  private async resolveWorkspace(slug: string, userId: string) {
    const workspace = await this.workspacesService.findBySlug(slug);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const userWorkspaces = await this.workspacesService.findByUserId(userId);
    const member = userWorkspaces.find((w) => w.id === workspace.id);
    if (!member) {
      throw new ForbiddenException('Not a member of this workspace');
    }

    return workspace;
  }

  // ─── Create Key ──────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create an API key (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  async createKey(
    @Param('workspaceSlug') slug: string,
    @Body(new ZodValidationPipe(createKeySchema)) body: CreateKeyInput,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    const result = await this.keysService.createKey(ws.id, body, user.id);

    return {
      data: {
        key: result.key,
        keyId: result.keyId,
      },
    };
  }

  // ─── List Keys ───────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List API keys (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiQuery({ name: 'ownerId', required: false })
  @ApiQuery({ name: 'environment', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async listKeys(
    @Param('workspaceSlug') slug: string,
    @Query('ownerId') ownerId: string | undefined,
    @Query('environment') environment: string | undefined,
    @Query('limit') limitStr: string | undefined,
    @Query('offset') offsetStr: string | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);

    const input: ListKeysInput = listKeysSchema.parse({
      workspaceId: ws.id,
      ownerId,
      environment,
      limit: limitStr ? parseInt(limitStr, 10) : undefined,
      offset: offsetStr ? parseInt(offsetStr, 10) : undefined,
    });

    const result = await this.keysService.listKeys(input);

    return {
      data: result.keys,
      meta: {
        total: result.total,
        limit: input.limit,
        offset: input.offset,
      },
    };
  }

  // ─── Get Key ─────────────────────────────────────────────────────────────────

  @Get(':keyId')
  @ApiOperation({ summary: 'Get a single API key (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiParam({ name: 'keyId', description: 'The key ID' })
  async getKey(
    @Param('workspaceSlug') slug: string,
    @Param('keyId') keyId: string,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    const key = await this.keysService.getKey(keyId, ws.id);
    return { data: key };
  }

  // ─── Update Key ──────────────────────────────────────────────────────────────

  @Patch(':keyId')
  @ApiOperation({ summary: 'Update an API key (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiParam({ name: 'keyId', description: 'The key ID' })
  async updateKey(
    @Param('workspaceSlug') slug: string,
    @Param('keyId') keyId: string,
    @Body(new ZodValidationPipe(updateKeySchema)) body: UpdateKeyInput,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    const updated = await this.keysService.updateKey(keyId, ws.id, body, user.id);
    return { data: updated };
  }

  // ─── Revoke Key ──────────────────────────────────────────────────────────────

  @Post(':keyId/revoke')
  @ApiOperation({ summary: 'Revoke an API key (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiParam({ name: 'keyId', description: 'The key ID' })
  async revokeKey(
    @Param('workspaceSlug') slug: string,
    @Param('keyId') keyId: string,
    @Body() body: { gracePeriodMs?: number },
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    await this.keysService.revokeKey(keyId, ws.id, body?.gracePeriodMs || 0, user.id);
    return { data: { success: true } };
  }

  // ─── Rotate Key ──────────────────────────────────────────────────────────────

  @Post(':keyId/rotate')
  @ApiOperation({ summary: 'Rotate an API key (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiParam({ name: 'keyId', description: 'The key ID' })
  async rotateKey(
    @Param('workspaceSlug') slug: string,
    @Param('keyId') keyId: string,
    @Body() body: { gracePeriodMs?: number },
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    const result = await this.keysService.rotateKey(
      keyId,
      ws.id,
      body?.gracePeriodMs || 300000,
      user.id,
    );

    return {
      data: {
        key: result.key,
        keyId: result.keyId,
      },
    };
  }
}
