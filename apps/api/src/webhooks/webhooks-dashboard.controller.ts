import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
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
import { WebhooksService } from './webhooks.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import type { CreateWebhookInput, UpdateWebhookInput } from '@keyforge/shared';

@ApiTags('dashboard')
@Controller('v1/workspaces/:workspaceSlug/webhooks')
@UseGuards(DashboardProxyGuard)
export class WebhooksDashboardController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly workspacesService: WorkspacesService,
  ) {}

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

  // ─── List Webhooks ───────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'List webhook endpoints (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  async listWebhooks(
    @Param('workspaceSlug') slug: string,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    const webhooks = await this.webhooksService.list(ws.id);
    return { data: webhooks };
  }

  // ─── Create Webhook ──────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Create a webhook endpoint (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  async createWebhook(
    @Param('workspaceSlug') slug: string,
    @Body() body: CreateWebhookInput,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    const webhook = await this.webhooksService.create(ws.id, body);
    return { data: webhook };
  }

  // ─── Get Webhook ─────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get a webhook endpoint (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiParam({ name: 'id', description: 'Webhook endpoint ID' })
  async getWebhook(
    @Param('workspaceSlug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    const webhook = await this.webhooksService.get(id, ws.id);
    return { data: webhook };
  }

  // ─── Update Webhook ──────────────────────────────────────────────────────────

  @Patch(':id')
  @ApiOperation({ summary: 'Update a webhook endpoint (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiParam({ name: 'id', description: 'Webhook endpoint ID' })
  async updateWebhook(
    @Param('workspaceSlug') slug: string,
    @Param('id') id: string,
    @Body() body: UpdateWebhookInput,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    const updated = await this.webhooksService.update(id, ws.id, body);
    return { data: updated };
  }

  // ─── Delete Webhook ──────────────────────────────────────────────────────────

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook endpoint (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiParam({ name: 'id', description: 'Webhook endpoint ID' })
  async deleteWebhook(
    @Param('workspaceSlug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    await this.webhooksService.delete(id, ws.id);
    return { data: { success: true } };
  }

  // ─── Delivery History ────────────────────────────────────────────────────────

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Get webhook delivery history (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiParam({ name: 'id', description: 'Webhook endpoint ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getDeliveries(
    @Param('workspaceSlug') slug: string,
    @Param('id') id: string,
    @Query('limit') limitStr: string | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    // Verify the webhook belongs to this workspace
    await this.webhooksService.get(id, ws.id);
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const deliveries = await this.webhooksService.getDeliveries(id, limit);
    return { data: deliveries };
  }
}
