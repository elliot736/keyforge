import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BillingService } from './billing.service';

@Injectable()
export class BillingWorker {
  private readonly logger = new Logger(BillingWorker.name);

  constructor(private readonly billingService: BillingService) {}

  /**
   * Every 10 minutes: auto-sync usage to Stripe for all paying workspaces.
   *
   * Reports meter events (tokens, requests, cost) to Stripe Billing Meters
   * and syncs subscription usage records for metered billing items.
   */
  @Cron('*/10 * * * *')
  async syncUsageToStripe(): Promise<void> {
    try {
      await this.billingService.syncAllWorkspaces();
    } catch (err) {
      this.logger.error(
        `Stripe usage sync failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
