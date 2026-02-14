import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RootKeyGuard } from '../auth/guards/root-key.guard';
import { CurrentWorkspace, WorkspaceContext } from '../common/decorators/workspace.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { UsageService } from './usage.service';
import { reportUsageSchema, getUsageSchema } from '@keyforge/shared';
import type { ReportUsageInput, GetUsageInput } from '@keyforge/shared';

@Controller('v1')
@UseGuards(RootKeyGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  // ─── Report Usage ─────────────────────────────────────────────────────────

  @Post('usage.report')
  @HttpCode(HttpStatus.OK)
  async reportUsage(
    @Body(new ZodValidationPipe(reportUsageSchema)) body: ReportUsageInput,
  ) {
    await this.usageService.reportUsage(body);
    return { data: { success: true } };
  }

  // ─── Get Usage Stats ──────────────────────────────────────────────────────

  @Get('usage')
  async getUsage(
    @Query('keyId') keyId: string | undefined,
    @Query('model') model: string | undefined,
    @Query('environment') environment: string | undefined,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('granularity') granularity: string | undefined,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const input: GetUsageInput = getUsageSchema.parse({
      workspaceId: workspace.id,
      keyId,
      model,
      environment,
      from,
      to,
      granularity: granularity ?? 'day',
    });

    const stats = await this.usageService.getUsageStats(input);

    return { data: stats };
  }

  // ─── Workspace Usage Summary ──────────────────────────────────────────────

  @Get('usage/summary')
  async getUsageSummary(
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const summary = await this.usageService.getWorkspaceUsageSummary(workspace.id);
    return { data: summary };
  }
}
