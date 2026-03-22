import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { DashboardProxyGuard } from '../auth/guards/dashboard-proxy.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { SessionUser } from '../auth/auth.service';
import { AnalyticsService } from './analytics.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

@ApiTags('dashboard')
@Controller('v1/workspaces/:workspaceSlug/analytics')
@UseGuards(DashboardProxyGuard)
export class AnalyticsDashboardController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  private async resolveWorkspace(slug: string, userId: string) {
    const workspace = await this.workspacesService.findBySlug(slug);
    if (!workspace) throw new NotFoundException('Workspace not found');

    const userWorkspaces = await this.workspacesService.findByUserId(userId);
    const member = userWorkspaces.find((w) => w.id === workspace.id);
    if (!member) throw new ForbiddenException('Not a member of this workspace');

    return workspace;
  }

  @Get()
  @ApiOperation({ summary: 'Get full analytics payload (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'granularity', required: false, enum: ['hour', 'day', 'month'] })
  @ApiQuery({ name: 'keyId', required: false })
  async getAnalytics(
    @Param('workspaceSlug') slug: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('granularity') granularity: 'hour' | 'day' | 'month' | undefined,
    @Query('keyId') keyId: string | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);

    const [modelBreakdown, tokenTrends, costProjection] = await Promise.all([
      this.analyticsService.getModelBreakdown(ws.id, from, to, keyId),
      this.analyticsService.getTokenIOTrend(ws.id, from, to, granularity || 'day'),
      this.analyticsService.getCostProjection(ws.id),
    ]);

    return {
      data: {
        modelBreakdown,
        tokenTrends,
        costProjection,
      },
    };
  }
}
