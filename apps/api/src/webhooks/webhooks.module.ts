import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhooksDashboardController } from './webhooks-dashboard.controller';
import { WebhooksProcessor } from './webhooks.processor';
import { WEBHOOK_DELIVERY_QUEUE } from './webhooks.constants';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Global()
@Module({
  imports: [
    WorkspacesModule,
    BullModule.registerQueueAsync({
      name: WEBHOOK_DELIVERY_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = new URL(config.get<string>('REDIS_URL')!);
        return {
          connection: {
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port || '6379', 10),
            password: redisUrl.password || undefined,
            username: redisUrl.username || undefined,
            db: redisUrl.pathname ? parseInt(redisUrl.pathname.slice(1), 10) || 0 : 0,
          },
        };
      },
    }),
  ],
  controllers: [WebhooksController, WebhooksDashboardController],
  providers: [WebhooksService, WebhooksProcessor],
  exports: [WebhooksService],
})
export class WebhooksModule {}
