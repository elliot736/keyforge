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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RootKeyGuard } from '../auth/guards/root-key.guard';
import { CurrentWorkspace, WorkspaceContext } from '../common/decorators/workspace.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WebhooksService } from './webhooks.service';
import { createWebhookSchema, updateWebhookSchema } from '@keyforge/shared';
import type { CreateWebhookInput, UpdateWebhookInput } from '@keyforge/shared';

@Controller('v1/webhooks')
@UseGuards(RootKeyGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  // ─── Create Webhook ─────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createWebhookSchema)) body: CreateWebhookInput,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const endpoint = await this.webhooksService.create(workspace.id, body);
    return { data: endpoint };
  }

  // ─── List Webhooks ──────────────────────────────────────────────────────────

  @Get()
  async list(@CurrentWorkspace() workspace: WorkspaceContext) {
    const endpoints = await this.webhooksService.list(workspace.id);
    return { data: endpoints };
  }

  // ─── Get Webhook ────────────────────────────────────────────────────────────

  @Get(':id')
  async get(
    @Param('id') id: string,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const endpoint = await this.webhooksService.get(id, workspace.id);
    return { data: endpoint };
  }

  // ─── Update Webhook ─────────────────────────────────────────────────────────

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWebhookSchema)) body: UpdateWebhookInput,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const updated = await this.webhooksService.update(id, workspace.id, body);
    return { data: updated };
  }

  // ─── Delete Webhook ─────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param('id') id: string,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    await this.webhooksService.delete(id, workspace.id);
    return { data: { success: true } };
  }

  // ─── Get Deliveries ─────────────────────────────────────────────────────────

  @Get(':id/deliveries')
  async getDeliveries(
    @Param('id') id: string,
    @Query('limit') limitStr: string | undefined,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    // Verify the webhook belongs to this workspace
    await this.webhooksService.get(id, workspace.id);

    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 50, 100) : 50;
    const deliveries = await this.webhooksService.getDeliveries(id, limit);
    return { data: deliveries };
  }

  // ─── Retry Delivery ─────────────────────────────────────────────────────────

  @Post(':id/deliveries/:deliveryId/retry')
  @HttpCode(HttpStatus.OK)
  async retryDelivery(
    @Param('id') id: string,
    @Param('deliveryId') deliveryId: string,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    // Verify the webhook belongs to this workspace
    await this.webhooksService.get(id, workspace.id);

    await this.webhooksService.retryDelivery(deliveryId);
    return { data: { success: true } };
  }
}
