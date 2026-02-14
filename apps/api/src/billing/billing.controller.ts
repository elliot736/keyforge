import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/guards/session.guard';
import { WorkspaceRoleGuard } from '../auth/guards/workspace-role.guard';
import { RequireRole } from '../auth/guards/workspace-role.guard';
import { CurrentWorkspace, WorkspaceContext } from '../common/decorators/workspace.decorator';
import { BillingService } from './billing.service';

@Controller('v1')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  // ─── Create Checkout Session ──────────────────────────────────────────────

  @Post('billing/checkout')
  @UseGuards(SessionGuard, WorkspaceRoleGuard)
  @RequireRole('admin')
  @HttpCode(HttpStatus.OK)
  async createCheckout(
    @Body() body: { workspaceId: string; plan: string },
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    if (!body.plan) {
      throw new BadRequestException('plan is required');
    }

    const result = await this.billingService.createCheckoutSession(
      workspace.id,
      body.plan,
    );

    return { data: result };
  }

  // ─── Create Portal Session ────────────────────────────────────────────────

  @Post('billing/portal')
  @UseGuards(SessionGuard, WorkspaceRoleGuard)
  @RequireRole('admin')
  @HttpCode(HttpStatus.OK)
  async createPortal(
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const result = await this.billingService.createPortalSession(workspace.id);
    return { data: result };
  }

  // ─── Get Subscription ─────────────────────────────────────────────────────

  @Get('billing/subscription')
  @UseGuards(SessionGuard, WorkspaceRoleGuard)
  @RequireRole('member')
  async getSubscription(
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const subscription = await this.billingService.getSubscription(workspace.id);
    return { data: subscription };
  }

  // ─── Stripe Webhook ───────────────────────────────────────────────────────

  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(
    @Req() request: FastifyRequest,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    // Fastify provides the raw body via request.rawBody when configured,
    // or we can access the body buffer directly.
    const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new BadRequestException(
        'Raw request body not available. Ensure rawBody is enabled in Fastify config.',
      );
    }

    try {
      const event = this.billingService.constructWebhookEvent(rawBody, signature);
      await this.billingService.handleWebhookEvent(event);
      return { received: true };
    } catch (err) {
      this.logger.warn(
        `Stripe webhook validation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException(
        `Webhook signature verification failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }
}
