import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { RootKeyGuard } from '../auth/guards/root-key.guard';
import { CurrentWorkspace, WorkspaceContext } from '../common/decorators/workspace.decorator';
import { AuditService } from './audit.service';

@Controller('v1/audit-logs')
@UseGuards(RootKeyGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // ─── Query Audit Logs ───────────────────────────────────────────────────────

  @Get()
  async query(
    @Query('actorId') actorId: string | undefined,
    @Query('action') action: string | undefined,
    @Query('resourceType') resourceType: string | undefined,
    @Query('resourceId') resourceId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('limit') limitStr: string | undefined,
    @Query('offset') offsetStr: string | undefined,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const entries = await this.auditService.query({
      workspaceId: workspace.id,
      actorId,
      action,
      resourceType,
      resourceId,
      from,
      to,
      limit: limitStr ? parseInt(limitStr, 10) : undefined,
      offset: offsetStr ? parseInt(offsetStr, 10) : undefined,
    });

    return {
      data: entries,
      meta: {
        limit: limitStr ? parseInt(limitStr, 10) : 50,
        offset: offsetStr ? parseInt(offsetStr, 10) : 0,
      },
    };
  }

  // ─── Export Audit Logs ──────────────────────────────────────────────────────

  @Get('export')
  async export(
    @Query('actorId') actorId: string | undefined,
    @Query('action') action: string | undefined,
    @Query('resourceType') resourceType: string | undefined,
    @Query('resourceId') resourceId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Res() reply: FastifyReply,
  ) {
    const entries = await this.auditService.query({
      workspaceId: workspace.id,
      actorId,
      action,
      resourceType,
      resourceId,
      from,
      to,
      limit: 10000,
      offset: 0,
    });

    const filename = `audit-logs-${workspace.id}-${new Date().toISOString().split('T')[0]}.json`;

    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(JSON.stringify({ data: entries }, null, 2));
  }

  // ─── Get Single Entry ──────────────────────────────────────────────────────

  @Get(':id')
  async getEntry(
    @Param('id') id: string,
    @CurrentWorkspace() workspace: WorkspaceContext,
  ) {
    const entry = await this.auditService.getEntry(id, workspace.id);
    return { data: entry };
  }
}
