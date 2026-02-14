import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { KeysModule } from './keys/keys.module';
import { VerifyModule } from './verify/verify.module';
import { RateLimitModule } from './ratelimit/ratelimit.module';
import { UsageModule } from './usage/usage.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AuditModule } from './audit/audit.module';
import { BillingModule } from './billing/billing.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { HealthModule } from './health/health.module';
import { envSchema } from './config/env.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    AuthModule,
    WorkspacesModule,
    KeysModule,
    VerifyModule,
    RateLimitModule,
    UsageModule,
    WebhooksModule,
    AuditModule,
    BillingModule,
    HealthModule,
  ],
})
export class AppModule {}
