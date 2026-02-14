import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
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
@Controller('v1')
export class VerifyController {
  constructor(private readonly verifyService: VerifyService) {}

  @Post('keys.verifyKey')
  @HttpCode(HttpStatus.OK)
  async verifyKey(
    @Body(new ZodValidationPipe(verifyKeySchema)) body: VerifyKeyInput,
  ) {
    return this.verifyService.verify(body.key);
  }
}
