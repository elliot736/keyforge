import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { RootKeyGuard } from '../auth/guards/root-key.guard';
import { CurrentWorkspace, WorkspaceContext } from '../common/decorators/workspace.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { KeysService } from './keys.service';
import {
  createKeySchema,
  updateKeySchema,
  revokeKeySchema,
  rotateKeySchema,
  listKeysSchema,
} from '@keyforge/shared';
import type {
  CreateKeyInput,
  UpdateKeyInput,
  RevokeKeyInput,
  RotateKeyInput,
  ListKeysInput,
} from '@keyforge/shared';
@ApiTags('keys')
@ApiBearerAuth()
@Controller('v1')
@UseGuards(RootKeyGuard)
export class KeysController {
  constructor(private readonly keysService: KeysService) {}

  // ─── Create Key ──────────────────────────────────────────────────────────

  @Post('keys.createKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a new API key' })
  @ApiResponse({ status: 200, description: 'Key created successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createKey(
    @Body(new ZodValidationPipe(createKeySchema)) body: CreateKeyInput,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const result = await this.keysService.createKey(
      workspace.id,
      body,
      workspace.id, // actorId = workspace context from root key
    );

    return {
      data: {
        key: result.key,
        keyId: result.keyId,
      },
    };
  }

  // ─── Revoke Key ──────────────────────────────────────────────────────────

  @Post('keys.revokeKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 200, description: 'Key revoked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Key not found' })
  async revokeKey(
    @Body(new ZodValidationPipe(revokeKeySchema)) body: RevokeKeyInput,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    await this.keysService.revokeKey(
      body.keyId,
      workspace.id,
      body.gracePeriodMs,
      workspace.id,
    );

    return { data: { success: true } };
  }

  // ─── Rotate Key ──────────────────────────────────────────────────────────

  @Post('keys.rotateKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate an API key', description: 'Creates a new key and optionally revokes the old one after a grace period.' })
  @ApiResponse({ status: 200, description: 'Key rotated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Key not found' })
  async rotateKey(
    @Body(new ZodValidationPipe(rotateKeySchema)) body: RotateKeyInput,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const result = await this.keysService.rotateKey(
      body.keyId,
      workspace.id,
      body.gracePeriodMs,
      workspace.id,
    );

    return {
      data: {
        key: result.key,
        keyId: result.keyId,
      },
    };
  }

  // ─── List Keys ───────────────────────────────────────────────────────────

  @Get('keys')
  @ApiOperation({ summary: 'List API keys', description: 'Returns a paginated list of keys for the workspace.' })
  @ApiQuery({ name: 'ownerId', required: false, description: 'Filter by owner ID' })
  @ApiQuery({ name: 'environment', required: false, description: 'Filter by environment' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of keys' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listKeys(
    @Query('ownerId') ownerId: string | undefined,
    @Query('environment') environment: string | undefined,
    @Query('limit') limitStr: string | undefined,
    @Query('offset') offsetStr: string | undefined,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const input: ListKeysInput = listKeysSchema.parse({
      workspaceId: workspace.id,
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

  // ─── Get Key ─────────────────────────────────────────────────────────────

  @Get('keys/:keyId')
  @ApiOperation({ summary: 'Get a single API key by ID' })
  @ApiParam({ name: 'keyId', description: 'The key ID' })
  @ApiResponse({ status: 200, description: 'Key details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Key not found' })
  async getKey(
    @Param('keyId') keyId: string,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const key = await this.keysService.getKey(keyId, workspace.id);
    return { data: key };
  }

  // ─── Update Key ──────────────────────────────────────────────────────────

  @Patch('keys/:keyId')
  @ApiOperation({ summary: 'Update an API key', description: 'Partially update key metadata such as name, ownerId, meta, ratelimit, or expiration.' })
  @ApiParam({ name: 'keyId', description: 'The key ID' })
  @ApiResponse({ status: 200, description: 'Key updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Key not found' })
  async updateKey(
    @Param('keyId') keyId: string,
    @Body(new ZodValidationPipe(updateKeySchema)) body: UpdateKeyInput,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const updated = await this.keysService.updateKey(
      keyId,
      workspace.id,
      body,
      workspace.id,
    );

    return { data: updated };
  }
}
