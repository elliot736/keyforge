import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(@Inject(ConfigService) config: ConfigService) {
    const redisUrl = config?.get<string>('REDIS_URL') || process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL is not configured');
    }
    super(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }

  async onModuleDestroy() {
    await this.quit();
  }
}
