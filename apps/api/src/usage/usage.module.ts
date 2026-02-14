import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';
import { UsageProcessor } from './usage.processor';
import { UsageWorker } from './usage.worker';

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
  ],
  controllers: [UsageController],
  providers: [UsageService, UsageProcessor, UsageWorker],
  exports: [UsageService],
})
export class UsageModule {}
