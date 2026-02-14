import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DRIZZLE } from '../database/database.module';
import { RedisService } from '../redis/redis.service';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '../database/schema';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy' })
  async check() {
    const checks: Record<string, { status: string; latency?: number }> = {};
    let healthy = true;

    // Database check
    try {
      const dbStart = Date.now();
      await this.db.execute(sql`SELECT 1`);
      checks.database = { status: 'up', latency: Date.now() - dbStart };
    } catch {
      checks.database = { status: 'down' };
      healthy = false;
    }

    // Redis check
    try {
      const redisStart = Date.now();
      await this.redis.ping();
      checks.redis = { status: 'up', latency: Date.now() - redisStart };
    } catch {
      checks.redis = { status: 'down' };
      healthy = false;
    }

    return {
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
