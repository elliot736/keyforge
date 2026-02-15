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
import { UsageService } from './usage.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import type { GetUsageInput } from '@keyforge/shared';

@ApiTags('dashboard')
@Controller('v1/workspaces/:workspaceSlug/usage')
@UseGuards(DashboardProxyGuard)
export class UsageDashboardController {
  constructor(
    private readonly usageService: UsageService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  private async resolveWorkspace(slug: string, userId: string) {
    const workspace = await this.workspacesService.findBySlug(slug);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const userWorkspaces = await this.workspacesService.findByUserId(userId);
    const member = userWorkspaces.find((w) => w.id === workspace.id);
    if (!member) {
      throw new ForbiddenException('Not a member of this workspace');
    }

    return workspace;
  }

  // ─── Get Usage Stats ─────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get usage statistics (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiQuery({ name: 'keyId', required: false, description: 'Filter by key ID' })
  @ApiQuery({ name: 'from', required: true, description: 'Start date (ISO string)' })
  @ApiQuery({ name: 'to', required: true, description: 'End date (ISO string)' })
  @ApiQuery({ name: 'granularity', required: false, enum: ['hour', 'day', 'month'] })
  async getUsageStats(
    @Param('workspaceSlug') slug: string,
    @Query('keyId') keyId: string | undefined,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('granularity') granularity: 'hour' | 'day' | 'month' | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);

    const input: GetUsageInput = {
      workspaceId: ws.id,
      keyId,
      from,
      to,
      granularity: granularity || 'day',
    };

    const stats = await this.usageService.getUsageStats(input);
    return { data: stats };
  }

  // ─── Get Usage Summary ───────────────────────────────────────────────────────

  @Get('summary')
  @ApiOperation({ summary: 'Get workspace usage summary (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  async getUsageSummary(
    @Param('workspaceSlug') slug: string,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    const summary = await this.usageService.getWorkspaceUsageSummary(ws.id);
    return { data: summary };
  }
}
