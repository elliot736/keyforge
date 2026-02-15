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
import { AuditService } from './audit.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

@ApiTags('dashboard')
@Controller('v1/workspaces/:workspaceSlug/audit-logs')
@UseGuards(DashboardProxyGuard)
export class AuditDashboardController {
  constructor(
    private readonly auditService: AuditService,
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

  // ─── Query Audit Logs ────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Query audit logs (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'resourceType', required: false })
  @ApiQuery({ name: 'resourceId', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async queryAuditLogs(
    @Param('workspaceSlug') slug: string,
    @Query('actorId') actorId: string | undefined,
    @Query('action') action: string | undefined,
    @Query('resourceType') resourceType: string | undefined,
    @Query('resourceId') resourceId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('limit') limitStr: string | undefined,
    @Query('offset') offsetStr: string | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);

    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

    const entries = await this.auditService.query({
      workspaceId: ws.id,
      actorId,
      action,
      resourceType,
      resourceId,
      from,
      to,
      limit,
      offset,
    });

    return {
      data: entries,
      meta: { limit, offset },
    };
  }

  // ─── Export Audit Logs ───────────────────────────────────────────────────────

  @Get('export')
  @ApiOperation({ summary: 'Export audit logs (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'resourceType', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date string' })
  async exportAuditLogs(
    @Param('workspaceSlug') slug: string,
    @Query('actorId') actorId: string | undefined,
    @Query('action') action: string | undefined,
    @Query('resourceType') resourceType: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);

    // Export fetches up to 1000 entries without pagination
    const entries = await this.auditService.query({
      workspaceId: ws.id,
      actorId,
      action,
      resourceType,
      from,
      to,
      limit: 1000,
      offset: 0,
    });

    return { data: entries };
  }

  // ─── Get Audit Log Entry ─────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get a single audit log entry (dashboard)' })
  @ApiParam({ name: 'workspaceSlug', description: 'Workspace slug' })
  @ApiParam({ name: 'id', description: 'Audit log entry ID' })
  async getAuditLogEntry(
    @Param('workspaceSlug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ) {
    const ws = await this.resolveWorkspace(slug, user.id);
    const entry = await this.auditService.getEntry(id, ws.id);
    return { data: entry };
  }
}
