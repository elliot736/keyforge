import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { signWebhookPayload } from '@keyforge/shared';
import { WEBHOOK_DELIVERY_QUEUE, CIRCUIT_BREAKER_THRESHOLD, CIRCUIT_BREAKER_RESET_SECONDS } from './webhooks.constants';
import { RedisService } from '../redis/redis.service';

interface WebhookDeliveryJob {
  deliveryId: string;
  endpointId: string;
  url: string;
  secret: string;
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

@Processor(WEBHOOK_DELIVERY_QUEUE)
export class WebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly redis: RedisService,
  ) {
    super();
  }

  private circuitBreakerKey(endpointId: string): string {
    return `keyforge:webhook:cb:${endpointId}`;
  }

  private async isCircuitOpen(endpointId: string): Promise<boolean> {
    try {
      const failures = await this.redis.get(this.circuitBreakerKey(endpointId));
      return failures !== null && parseInt(failures, 10) >= CIRCUIT_BREAKER_THRESHOLD;
    } catch {
      return false;
    }
  }

  private async recordFailure(endpointId: string): Promise<void> {
    try {
      const key = this.circuitBreakerKey(endpointId);
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, CIRCUIT_BREAKER_RESET_SECONDS);
      }
    } catch {
      // Non-critical
    }
  }

  private async resetFailures(endpointId: string): Promise<void> {
    try {
      await this.redis.del(this.circuitBreakerKey(endpointId));
    } catch {
      // Non-critical
    }
  }

  async process(job: Job<WebhookDeliveryJob>): Promise<void> {
    const { deliveryId, endpointId, url, secret, event, data, timestamp } = job.data;

    // Circuit breaker: skip delivery if endpoint has too many consecutive failures
    if (await this.isCircuitOpen(endpointId)) {
      this.logger.warn(
        `Circuit breaker open for endpoint ${endpointId}, skipping delivery ${deliveryId}`,
      );
      await this.db
        .update(schema.webhookDeliveries)
        .set({
          status: 'failed',
          completedAt: new Date(),
          responseBody: 'Circuit breaker open: too many consecutive failures',
        })
        .where(eq(schema.webhookDeliveries.id, deliveryId));
      return;
    }

    // Mark as delivering
    await this.db
      .update(schema.webhookDeliveries)
      .set({ status: 'delivering' })
      .where(eq(schema.webhookDeliveries.id, deliveryId));

    const body = JSON.stringify({
      id: deliveryId,
      event,
      timestamp,
      data,
    });

    // Compute HMAC-SHA256 signature
    const ts = Math.floor(new Date(timestamp).getTime() / 1000).toString();
    const signaturePayload = `${ts}.${body}`;
    const hmac = signWebhookPayload(signaturePayload, secret);
    const signature = `v1,${hmac}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Webhook-Id': deliveryId,
          'Webhook-Timestamp': ts,
          'Webhook-Signature': signature,
          'User-Agent': 'KeyForge/1.0',
        },
        body,
        signal: controller.signal,
      });

      const responseBody = await response.text().catch(() => '');
      const attemptNumber = (job.attemptsMade ?? 0) + 1;

      if (response.ok) {
        // Success
        await this.db
          .update(schema.webhookDeliveries)
          .set({
            responseStatus: response.status,
            responseBody: responseBody.substring(0, 4096),
            attempts: attemptNumber,
            status: 'success',
            completedAt: new Date(),
          })
          .where(eq(schema.webhookDeliveries.id, deliveryId));

        this.logger.log(`Webhook delivery ${deliveryId} succeeded (${response.status})`);
        await this.resetFailures(endpointId);
      } else {
        // Non-2xx response
        await this.db
          .update(schema.webhookDeliveries)
          .set({
            responseStatus: response.status,
            responseBody: responseBody.substring(0, 4096),
            attempts: attemptNumber,
            status: attemptNumber >= 5 ? 'failed' : 'pending',
            completedAt: attemptNumber >= 5 ? new Date() : null,
          })
          .where(eq(schema.webhookDeliveries.id, deliveryId));

        if (attemptNumber >= 5) {
          this.logger.warn(
            `Webhook delivery ${deliveryId} permanently failed after ${attemptNumber} attempts. Deactivating endpoint ${endpointId}.`,
          );
          await this.db
            .update(schema.webhookEndpoints)
            .set({ enabled: false })
            .where(eq(schema.webhookEndpoints.id, endpointId));
        }

        await this.recordFailure(endpointId);
        throw new Error(`Webhook delivery failed with status ${response.status}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const attemptNumber = (job.attemptsMade ?? 0) + 1;
        await this.db
          .update(schema.webhookDeliveries)
          .set({
            attempts: attemptNumber,
            status: attemptNumber >= 5 ? 'failed' : 'pending',
            completedAt: attemptNumber >= 5 ? new Date() : null,
            responseBody: 'Request timed out after 30s',
          })
          .where(eq(schema.webhookDeliveries.id, deliveryId));

        if (attemptNumber >= 5) {
          await this.db
            .update(schema.webhookEndpoints)
            .set({ enabled: false })
            .where(eq(schema.webhookEndpoints.id, endpointId));
        }

        throw new Error('Webhook delivery timed out');
      }

      // For non-HTTP errors (network errors, etc.), update delivery and re-throw
      if (error instanceof Error && !error.message.startsWith('Webhook delivery failed')) {
        const attemptNumber = (job.attemptsMade ?? 0) + 1;
        await this.db
          .update(schema.webhookDeliveries)
          .set({
            attempts: attemptNumber,
            status: attemptNumber >= 5 ? 'failed' : 'pending',
            completedAt: attemptNumber >= 5 ? new Date() : null,
            responseBody: error.message.substring(0, 4096),
          })
          .where(eq(schema.webhookDeliveries.id, deliveryId));

        if (attemptNumber >= 5) {
          await this.db
            .update(schema.webhookEndpoints)
            .set({ enabled: false })
            .where(eq(schema.webhookEndpoints.id, endpointId));
        }
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
