import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../redis/redis.service';

export const THROTTLE_KEY = 'throttle';

export interface ThrottleOptions {
  /** Maximum requests in the window */
  limit: number;
  /** Window size in seconds */
  window: number;
}

/**
 * Decorator to apply IP-based rate limiting to management endpoints.
 * @param limit - Maximum requests in the window (default: 60)
 * @param window - Window size in seconds (default: 60)
 */
export const Throttle = (limit = 60, window = 60) =>
  SetMetadata(THROTTLE_KEY, { limit, window } as ThrottleOptions);

@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<ThrottleOptions | undefined>(THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    const route = `${request.method}:${request.url}`;
    const key = `keyforge:throttle:${ip}:${route}`;

    try {
      const current = await this.redis.incr(key);
      if (current === 1) {
        await this.redis.expire(key, options.window);
      }

      if (current > options.limit) {
        const ttl = await this.redis.ttl(key);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests',
            retryAfter: ttl > 0 ? ttl : options.window,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Fail open if Redis is unavailable
    }

    return true;
  }
}
