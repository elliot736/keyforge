import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, gte, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import type { PlanName } from '@keyforge/shared';
import Stripe from 'stripe';

/** Plan → Stripe Price ID mapping. In production, read from config or DB. */
const PLAN_PRICE_MAP: Record<string, string> = {
  pro: 'price_pro_monthly',
  enterprise: 'price_enterprise_monthly',
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string;
  private readonly enabled: boolean;

  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly config: ConfigService,
  ) {
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';

    if (stripeKey) {
      this.stripe = new Stripe(stripeKey, { apiVersion: '2025-03-31.basil' as Stripe.LatestApiVersion });
      this.enabled = true;
      this.logger.log('Stripe billing enabled');
    } else {
      this.stripe = null;
      this.enabled = false;
      this.logger.warn('Stripe billing disabled (STRIPE_SECRET_KEY not set)');
    }
  }

  // ─── Create Checkout Session ──────────────────────────────────────────────

  async createCheckoutSession(
    workspaceId: string,
    plan: string,
  ): Promise<{ url: string }> {
    this.assertEnabled();

    const priceId = PLAN_PRICE_MAP[plan];
    if (!priceId) {
      throw new BadRequestException(`Invalid plan: ${plan}. Available plans: ${Object.keys(PLAN_PRICE_MAP).join(', ')}`);
    }

    const workspace = await this.getWorkspaceOrFail(workspaceId);

    // If the workspace already has a Stripe customer, reuse it
    let customerId = workspace.stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripe!.customers.create({
        metadata: { workspaceId },
        email: workspace.billingEmail ?? undefined,
        name: workspace.name,
      });
      customerId = customer.id;

      // Save the customer ID immediately
      await this.db
        .update(schema.workspaces)
        .set({ stripeCustomerId: customerId })
        .where(eq(schema.workspaces.id, workspaceId));
    }

    const appUrl = this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';

    const session = await this.stripe!.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/settings/billing?canceled=true`,
      metadata: { workspaceId, plan },
      subscription_data: {
        metadata: { workspaceId, plan },
      },
    });

    if (!session.url) {
      throw new BadRequestException('Failed to create checkout session');
    }

    return { url: session.url };
  }

  // ─── Create Portal Session ────────────────────────────────────────────────

  async createPortalSession(workspaceId: string): Promise<{ url: string }> {
    this.assertEnabled();

    const workspace = await this.getWorkspaceOrFail(workspaceId);

    if (!workspace.stripeCustomerId) {
      throw new BadRequestException(
        'No billing account found. Please subscribe to a plan first.',
      );
    }

    const appUrl = this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';

    const session = await this.stripe!.billingPortal.sessions.create({
      customer: workspace.stripeCustomerId,
      return_url: `${appUrl}/settings/billing`,
    });

    return { url: session.url };
  }

  // ─── Sync Usage to Stripe ─────────────────────────────────────────────────

  async syncUsageToStripe(workspaceId: string): Promise<void> {
    this.assertEnabled();

    const workspace = await this.getWorkspaceOrFail(workspaceId);

    if (!workspace.stripeSubscriptionId) {
      this.logger.debug(`No subscription for workspace ${workspaceId}, skipping usage sync`);
      return;
    }

    const subscription = await this.stripe!.subscriptions.retrieve(
      workspace.stripeSubscriptionId,
    );

    const meteredItem = subscription.items.data.find(
      (item) => (item.price as Stripe.Price).recurring?.usage_type === 'metered',
    );

    if (!meteredItem) {
      this.logger.debug(`No metered item found for workspace ${workspaceId}`);
      return;
    }

    const periodStart = new Date((subscription.current_period_start as number) * 1000);
    const periodStartStr = periodStart.toISOString().slice(0, 10);

    const [usageResult] = await this.db
      .select({
        totalVerifications: sql<number>`coalesce(sum(${schema.usageRecords.verifications}), 0)::int`,
      })
      .from(schema.usageRecords)
      .where(
        and(
          eq(schema.usageRecords.workspaceId, workspaceId),
          gte(schema.usageRecords.period, periodStartStr),
        ),
      );

    const total = usageResult?.totalVerifications ?? 0;

    await this.stripe!.subscriptionItems.createUsageRecord(meteredItem.id, {
      quantity: total,
      timestamp: Math.floor(Date.now() / 1000),
      action: 'set',
    });

    this.logger.debug(`Synced ${total} usage units to Stripe for workspace ${workspaceId}`);
  }

  // ─── Stripe Billing Meters (token-based metering for AI) ────────────────

  /**
   * Report a meter event to Stripe Billing Meters.
   * This is the modern Stripe approach for usage-based billing.
   *
   * Workspace metadata should contain:
   *   __stripeMeterTokens: string    - Stripe Meter event name for token usage
   *   __stripeMeterRequests: string  - Stripe Meter event name for API requests
   *   __stripeMeterCost: string      - Stripe Meter event name for cost (in cents)
   */
  async reportMeterEvents(workspaceId: string): Promise<void> {
    if (!this.enabled || !this.stripe) return;

    const workspace = await this.getWorkspaceOrFail(workspaceId);
    if (!workspace.stripeCustomerId) return;

    const meta = (workspace.metadata as Record<string, unknown>) ?? {};
    const tokensMeter = meta.__stripeMeterTokens as string | undefined;
    const requestsMeter = meta.__stripeMeterRequests as string | undefined;
    const costMeter = meta.__stripeMeterCost as string | undefined;

    if (!tokensMeter && !requestsMeter && !costMeter) return;

    // Get usage for the current period (today)
    const today = new Date().toISOString().slice(0, 10);

    const [usage] = await this.db
      .select({
        totalRequests: sql<number>`coalesce(sum(${schema.usageRecords.verifications}), 0)::int`,
        totalTokens: sql<number>`coalesce(sum(${schema.usageRecords.tokensInput}) + sum(${schema.usageRecords.tokensOutput}), 0)::int`,
        totalCostCents: sql<number>`coalesce(sum(${schema.usageRecords.costCents}), 0)::int`,
      })
      .from(schema.usageRecords)
      .where(
        and(
          eq(schema.usageRecords.workspaceId, workspaceId),
          eq(schema.usageRecords.period, today),
        ),
      );

    const timestamp = Math.floor(Date.now() / 1000);
    const identifier = workspace.stripeCustomerId;
    const totalTokens = usage?.totalTokens ?? 0;
    const totalRequests = usage?.totalRequests ?? 0;
    const totalCostCents = usage?.totalCostCents ?? 0;

    try {
      const events: Promise<unknown>[] = [];

      if (tokensMeter && totalTokens > 0) {
        events.push(
          this.stripe.billing.meterEvents.create({
            event_name: tokensMeter,
            timestamp,
            payload: {
              value: String(totalTokens),
              stripe_customer_id: identifier,
            },
          }),
        );
      }

      if (requestsMeter && totalRequests > 0) {
        events.push(
          this.stripe.billing.meterEvents.create({
            event_name: requestsMeter,
            timestamp,
            payload: {
              value: String(totalRequests),
              stripe_customer_id: identifier,
            },
          }),
        );
      }

      if (costMeter && totalCostCents > 0) {
        events.push(
          this.stripe.billing.meterEvents.create({
            event_name: costMeter,
            timestamp,
            payload: {
              value: String(totalCostCents),
              stripe_customer_id: identifier,
            },
          }),
        );
      }

      if (events.length > 0) {
        await Promise.all(events);
        this.logger.debug(
          `Reported ${events.length} meter event(s) to Stripe for workspace ${workspaceId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to report meter events for workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Auto-sync all paying workspaces ────────────────────────────────────

  async syncAllWorkspaces(): Promise<void> {
    if (!this.enabled) return;

    const workspaces = await this.db
      .select({
        id: schema.workspaces.id,
        stripeCustomerId: schema.workspaces.stripeCustomerId,
        stripeSubscriptionId: schema.workspaces.stripeSubscriptionId,
        metadata: schema.workspaces.metadata,
      })
      .from(schema.workspaces)
      .where(
        and(
          sql`${schema.workspaces.stripeCustomerId} IS NOT NULL`,
          sql`${schema.workspaces.plan} != 'free'`,
        ),
      );

    let synced = 0;
    for (const ws of workspaces) {
      try {
        // Try Billing Meters first (modern approach)
        await this.reportMeterEvents(ws.id);

        // Also sync via subscription usage records (legacy approach)
        if (ws.stripeSubscriptionId) {
          await this.syncUsageToStripe(ws.id);
        }

        synced++;
      } catch (err) {
        this.logger.error(
          `Usage sync failed for workspace ${ws.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (synced > 0) {
      this.logger.log(`Auto-synced usage to Stripe for ${synced} workspace(s)`);
    }
  }

  // ─── Get Subscription ─────────────────────────────────────────────────────

  async getSubscription(
    workspaceId: string,
  ): Promise<{
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    stripeCustomerId: string | null;
  }> {
    const workspace = await this.getWorkspaceOrFail(workspaceId);

    const result = {
      plan: workspace.plan,
      status: 'active' as string,
      currentPeriodEnd: null as string | null,
      cancelAtPeriodEnd: false,
      stripeCustomerId: workspace.stripeCustomerId,
    };

    if (!this.enabled || !workspace.stripeSubscriptionId) {
      result.status = workspace.plan === 'free' ? 'active' : 'unknown';
      return result;
    }

    try {
      const subscription = await this.stripe!.subscriptions.retrieve(
        workspace.stripeSubscriptionId,
      );

      result.status = subscription.status;
      result.currentPeriodEnd = new Date(
        (subscription.current_period_end as number) * 1000,
      ).toISOString();
      result.cancelAtPeriodEnd = subscription.cancel_at_period_end;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch subscription for workspace ${workspaceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      result.status = 'unknown';
    }

    return result;
  }

  // ─── Handle Webhook Event ─────────────────────────────────────────────────

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    this.logger.debug(`Processing Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  /**
   * Construct and validate a Stripe webhook event from the raw body and signature.
   * This must be called before handleWebhookEvent.
   */
  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    this.assertEnabled();

    if (!this.webhookSecret) {
      throw new BadRequestException('Stripe webhook secret not configured');
    }

    return this.stripe!.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }

  // ─── Private: Webhook Handlers ────────────────────────────────────────────

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const workspaceId = session.metadata?.workspaceId;
    const plan = session.metadata?.plan as PlanName | undefined;

    if (!workspaceId) {
      this.logger.warn('Checkout session completed without workspaceId metadata');
      return;
    }

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : (session.customer as Stripe.Customer)?.id;

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as Stripe.Subscription)?.id;

    const updateFields: Record<string, unknown> = {
      stripeCustomerId: customerId ?? undefined,
      stripeSubscriptionId: subscriptionId ?? undefined,
    };

    if (plan && ['free', 'pro', 'enterprise'].includes(plan)) {
      updateFields.plan = plan;
    }

    await this.db
      .update(schema.workspaces)
      .set(updateFields)
      .where(eq(schema.workspaces.id, workspaceId));

    this.logger.log(`Workspace ${workspaceId} upgraded to plan: ${plan}`);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const workspaceId = subscription.metadata?.workspaceId;
    if (!workspaceId) {
      this.logger.warn('Subscription updated without workspaceId metadata');
      return;
    }

    // Determine the plan from the subscription's price
    const plan = subscription.metadata?.plan as PlanName | undefined;

    if (plan && ['free', 'pro', 'enterprise'].includes(plan)) {
      await this.db
        .update(schema.workspaces)
        .set({
          plan,
          stripeSubscriptionId: subscription.id,
        })
        .where(eq(schema.workspaces.id, workspaceId));

      this.logger.log(`Workspace ${workspaceId} subscription updated to plan: ${plan}`);
    }
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const workspaceId = subscription.metadata?.workspaceId;
    if (!workspaceId) {
      this.logger.warn('Subscription deleted without workspaceId metadata');
      return;
    }

    // Downgrade to free plan
    await this.db
      .update(schema.workspaces)
      .set({
        plan: 'free',
        stripeSubscriptionId: null,
      })
      .where(eq(schema.workspaces.id, workspaceId));

    this.logger.log(`Workspace ${workspaceId} downgraded to free (subscription deleted)`);
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : (invoice.customer as Stripe.Customer)?.id;

    if (!customerId) return;

    // Find workspace by Stripe customer ID
    const [workspace] = await this.db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.stripeCustomerId, customerId))
      .limit(1);

    if (!workspace) {
      this.logger.warn(`Payment failed for unknown customer: ${customerId}`);
      return;
    }

    // Flag the workspace by storing the payment failure in metadata
    const [current] = await this.db
      .select({ metadata: schema.workspaces.metadata })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspace.id))
      .limit(1);

    const existingMeta = (current?.metadata as Record<string, unknown>) ?? {};
    await this.db
      .update(schema.workspaces)
      .set({
        metadata: {
          ...existingMeta,
          __paymentFailed: true,
          __paymentFailedAt: new Date().toISOString(),
          __paymentFailedInvoiceId: invoice.id,
        },
      })
      .where(eq(schema.workspaces.id, workspace.id));

    this.logger.warn(`Payment failed for workspace ${workspace.id} (invoice: ${invoice.id})`);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private assertEnabled(): void {
    if (!this.enabled || !this.stripe) {
      throw new BadRequestException(
        'Billing is not available. Stripe is not configured.',
      );
    }
  }

  private async getWorkspaceOrFail(workspaceId: string) {
    const [workspace] = await this.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      throw new NotFoundException(`Workspace ${workspaceId} not found`);
    }

    return workspace;
  }
}
