import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { VerifyService } from './verify.service';
import { verifyKeySchema } from '@keyforge/shared';
import type { VerifyKeyInput } from '@keyforge/shared';

/**
 * Verify controller -- the hot path.
 *
 * This controller intentionally uses NO auth guards, interceptors, or
 * middleware beyond basic validation. Every millisecond counts here.
 */
@ApiTags('keys')
@Controller('v1')
export class VerifyController {
  constructor(private readonly verifyService: VerifyService) {}

  @Post('keys.verifyKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify an API key',
    description:
      'Check whether a key is valid. This is the hot-path endpoint optimised for sub-5 ms p95 latency.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['key'],
      properties: {
        key: {
          type: 'string',
          description: 'The API key to verify',
          example: 'sk_live_abc123',
        },
        model: {
          type: 'string',
          description: 'The model being used (for per-model policy enforcement)',
          example: 'gpt-4o',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Key verification result',
    schema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean', description: 'Whether the key is valid' },
        ownerId: { type: 'string', nullable: true },
        meta: { type: 'object', nullable: true },
        environment: { type: 'string', nullable: true },
        ratelimit: {
          type: 'object',
          nullable: true,
          properties: {
            limit: { type: 'number' },
            remaining: { type: 'number' },
            reset: { type: 'number' },
          },
        },
      },
    },
  })
  async verifyKey(
    @Body(new ZodValidationPipe(verifyKeySchema)) body: VerifyKeyInput,
  ) {
    return this.verifyService.verify(body.key, body.model);
  }
}
