import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { RootKeyGuard } from '../auth/guards/root-key.guard';
import { CurrentWorkspace, WorkspaceContext } from '../common/decorators/workspace.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('v1/analytics')
@UseGuards(RootKeyGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('models')
  @ApiOperation({ summary: 'Get cost and token breakdown by model' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'keyId', required: false })
  async getModelBreakdown(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('keyId') keyId: string | undefined,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const data = await this.analyticsService.getModelBreakdown(workspace.id, from, to, keyId);
    return { data };
  }

  @Get('tokens')
  @ApiOperation({ summary: 'Get token input/output trends over time' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'granularity', required: false, enum: ['hour', 'day', 'month'] })
  async getTokenTrends(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('granularity') granularity: 'hour' | 'day' | 'month' | undefined,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const data = await this.analyticsService.getTokenIOTrend(
      workspace.id,
      from,
      to,
      granularity || 'day',
    );
    return { data };
  }

  @Get('projection')
  @ApiOperation({ summary: 'Get projected monthly cost' })
  async getCostProjection(@CurrentWorkspace() workspace: WorkspaceContext) {
    const data = await this.analyticsService.getCostProjection(workspace.id);
    return { data };
  }
}
