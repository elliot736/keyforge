import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq, and, desc } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { generateId, generateWebhookSecret } from '@keyforge/shared';
import type { CreateWebhookInput, UpdateWebhookInput } from '@keyforge/shared';
import { WEBHOOK_DELIVERY_QUEUE } from './webhooks.module';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE) private readonly deliveryQueue: Queue,
  ) {}

  // ─── Create Webhook ─────────────────────────────────────────────────────────

  async create(workspaceId: string, input: CreateWebhookInput) {
    const id = generateId('whep');
    const secret = generateWebhookSecret();

    const [endpoint] = await this.db
      .insert(schema.webhookEndpoints)
      .values({
        id,
        workspaceId,
        url: input.url,
        events: input.events,
        secret,
        enabled: true,
      })
      .returning();

    return endpoint;
  }

  // ─── List Webhooks ──────────────────────────────────────────────────────────

  async list(workspaceId: string) {
    const endpoints = await this.db
      .select()
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.workspaceId, workspaceId))
      .orderBy(desc(schema.webhookEndpoints.createdAt));

    // Mask the signing secret - only show last 4 chars
    return endpoints.map((ep) => ({
      ...ep,
      secret: `whsec_${'*'.repeat(8)}${ep.secret.slice(-4)}`,
    }));
  }

  // ─── Get Webhook ────────────────────────────────────────────────────────────

  async get(id: string, workspaceId: string) {
    const [endpoint] = await this.db
      .select()
      .from(schema.webhookEndpoints)
      .where(
        and(
          eq(schema.webhookEndpoints.id, id),
          eq(schema.webhookEndpoints.workspaceId, workspaceId),
        ),
      );

    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    return {
      ...endpoint,
      secret: `whsec_${'*'.repeat(8)}${endpoint.secret.slice(-4)}`,
    };
  }

  // ─── Update Webhook ─────────────────────────────────────────────────────────

  async update(id: string, workspaceId: string, input: UpdateWebhookInput) {
    const [existing] = await this.db
      .select()
      .from(schema.webhookEndpoints)
      .where(
        and(
          eq(schema.webhookEndpoints.id, id),
          eq(schema.webhookEndpoints.workspaceId, workspaceId),
        ),
      );

    if (!existing) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    const updateData: Record<string, unknown> = {};
    if (input.url !== undefined) updateData.url = input.url;
    if (input.events !== undefined) updateData.events = input.events;
    if (input.active !== undefined) updateData.enabled = input.active;

    const [updated] = await this.db
      .update(schema.webhookEndpoints)
      .set(updateData)
      .where(eq(schema.webhookEndpoints.id, id))
      .returning();

    return {
      ...updated,
      secret: `whsec_${'*'.repeat(8)}${updated.secret.slice(-4)}`,
    };
  }

  // ─── Delete Webhook ─────────────────────────────────────────────────────────

  async delete(id: string, workspaceId: string) {
    const [existing] = await this.db
      .select()
      .from(schema.webhookEndpoints)
      .where(
        and(
          eq(schema.webhookEndpoints.id, id),
          eq(schema.webhookEndpoints.workspaceId, workspaceId),
        ),
      );

    if (!existing) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    await this.db
      .delete(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.id, id));

    return { success: true };
  }

  // ─── Fire Event ─────────────────────────────────────────────────────────────

  async fireEvent(
    workspaceId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const endpoints = await this.db
        .select()
        .from(schema.webhookEndpoints)
        .where(eq(schema.webhookEndpoints.workspaceId, workspaceId));

      const matching = endpoints.filter(
        (ep) => ep.enabled && ep.events.includes(event),
      );

      if (matching.length === 0) return;

      for (const ep of matching) {
        const deliveryId = generateId('whdl');
        const timestamp = new Date().toISOString();

        // Create delivery record
        await this.db.insert(schema.webhookDeliveries).values({
          id: deliveryId,
          endpointId: ep.id,
          event,
          payload: { event, data, timestamp },
          status: 'pending',
          attempts: 0,
          maxAttempts: 5,
        });

        // Enqueue BullMQ job
        await this.deliveryQueue.add(
          'deliver',
          {
            deliveryId,
            endpointId: ep.id,
            url: ep.url,
            secret: ep.secret,
            event,
            data,
            timestamp,
          },
          {
            attempts: 5,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to fire webhook ${event}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ─── Get Deliveries ─────────────────────────────────────────────────────────

  async getDeliveries(webhookId: string, limit = 50) {
    const deliveries = await this.db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.endpointId, webhookId))
      .orderBy(desc(schema.webhookDeliveries.createdAt))
      .limit(limit);

    return deliveries;
  }

  // ─── Retry Delivery ─────────────────────────────────────────────────────────

  async retryDelivery(deliveryId: string) {
    const [delivery] = await this.db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.id, deliveryId));

    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    // Get the endpoint for URL and secret
    const [endpoint] = await this.db
      .select()
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.id, delivery.endpointId));

    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }

    // Reset delivery status
    await this.db
      .update(schema.webhookDeliveries)
      .set({ status: 'pending', completedAt: null })
      .where(eq(schema.webhookDeliveries.id, deliveryId));

    const payload = delivery.payload as Record<string, unknown>;
    const timestamp = new Date().toISOString();

    // Re-enqueue delivery
    await this.deliveryQueue.add(
      'deliver',
      {
        deliveryId,
        endpointId: endpoint.id,
        url: endpoint.url,
        secret: endpoint.secret,
        event: delivery.event,
        data: payload.data ?? payload,
        timestamp,
      },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    return { success: true };
  }
}
