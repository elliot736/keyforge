import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';
import { UsageDashboardController } from './usage-dashboard.controller';
import { UsageProcessor } from './usage.processor';
import { UsageWorker } from './usage.worker';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsDashboardController } from './analytics-dashboard.controller';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AuditModule } from '../audit/audit.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: 'usage',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: new URL(config.get<string>('REDIS_URL')!).hostname,
          port: parseInt(new URL(config.get<string>('REDIS_URL')!).port || '6379'),
        },
      }),
    }),
    WebhooksModule,
    AuditModule,
    WorkspacesModule,
  ],
  controllers: [UsageController, UsageDashboardController, AnalyticsController, AnalyticsDashboardController],
  providers: [UsageService, UsageProcessor, UsageWorker, AnalyticsService],
  exports: [UsageService, AnalyticsService],
})
export class UsageModule {}
