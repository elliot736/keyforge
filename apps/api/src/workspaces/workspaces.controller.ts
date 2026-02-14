import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UsePipes,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
} from '@keyforge/shared';
import { WorkspacesService } from './workspaces.service';
import { DashboardAuth, DashboardAuthWithRole } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireRole } from '../auth/guards/workspace-role.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { SessionUser } from '../auth/auth.service';
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from '@keyforge/shared';

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});

type AddMemberInput = z.infer<typeof addMemberSchema>;
type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

@ApiTags('Workspaces')
@Controller('v1/workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  /**
   * Create a new workspace. The authenticated user becomes the owner.
   */
  @Post()
  @DashboardAuth()
  @UsePipes(new ZodValidationPipe(createWorkspaceSchema))
  @ApiOperation({ summary: 'Create a workspace' })
  @ApiResponse({ status: 201, description: 'Workspace created' })
  async create(
    @Body() body: CreateWorkspaceInput,
    @CurrentUser() user: SessionUser,
  ) {
    const workspace = await this.workspacesService.create(user.id, body);
    return { data: workspace };
  }

  /**
   * List all workspaces the current user is a member of.
   */
  @Get()
  @DashboardAuth()
  @ApiOperation({ summary: 'List workspaces' })
  @ApiResponse({ status: 200, description: 'Workspaces listed' })
  async list(@CurrentUser() user: SessionUser) {
    const workspaces = await this.workspacesService.findByUserId(user.id);
    return { data: workspaces };
  }

  /**
   * Get a single workspace by ID.
   * Requires the user to be at least a member.
   */
  @Get(':id')
  @DashboardAuthWithRole()
  @RequireRole('viewer')
  @ApiOperation({ summary: 'Get a workspace' })
  @ApiResponse({ status: 200, description: 'Workspace details' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  async findById(
    @Param('id') id: string,
    @CurrentUser() _user: SessionUser,
  ) {
    const workspace = await this.workspacesService.findById(id);
    return { data: workspace };
  }

  /**
   * Update a workspace.
   * Requires admin or owner role.
   */
  @Patch(':id')
  @DashboardAuthWithRole()
  @RequireRole('admin')
  @ApiOperation({ summary: 'Update a workspace' })
  @ApiResponse({ status: 200, description: 'Workspace updated' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWorkspaceSchema)) body: UpdateWorkspaceInput,
    @CurrentUser() _user: SessionUser,
  ) {
    const workspace = await this.workspacesService.update(id, body);
    return { data: workspace };
  }

  /**
   * Delete (soft-delete) a workspace.
   * Owner only.
   */
  @Delete(':id')
  @DashboardAuthWithRole()
  @RequireRole('owner')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a workspace' })
  @ApiResponse({ status: 204, description: 'Workspace deleted' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  async delete(
    @Param('id') id: string,
    @CurrentUser() _user: SessionUser,
  ) {
    await this.workspacesService.delete(id);
  }

  // ─── Member Management ───────────────────────────────────────────────────

  /**
   * Add a member to the workspace.
   * Requires admin or owner role.
   */
  @Post(':id/members')
  @DashboardAuthWithRole()
  @RequireRole('admin')
  @ApiOperation({ summary: 'Add a workspace member' })
  @ApiResponse({ status: 201, description: 'Member added' })
  @ApiResponse({ status: 409, description: 'Already a member' })
  async addMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addMemberSchema)) body: AddMemberInput,
    @CurrentUser() _user: SessionUser,
  ) {
    const member = await this.workspacesService.addMember(
      id,
      body.userId,
      body.role,
    );
    return { data: member };
  }

  /**
   * Remove a member from the workspace.
   * Requires admin or owner role.
   */
  @Delete(':id/members/:userId')
  @DashboardAuthWithRole()
  @RequireRole('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a workspace member' })
  @ApiResponse({ status: 204, description: 'Member removed' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() _user: SessionUser,
  ) {
    await this.workspacesService.removeMember(id, userId);
  }

  /**
   * Change a member's role.
   * Owner only.
   */
  @Patch(':id/members/:userId')
  @DashboardAuthWithRole()
  @RequireRole('owner')
  @ApiOperation({ summary: 'Update member role' })
  @ApiResponse({ status: 200, description: 'Role updated' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  async updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updateMemberRoleSchema))
    body: UpdateMemberRoleInput,
    @CurrentUser() _user: SessionUser,
  ) {
    const member = await this.workspacesService.updateMemberRole(
      id,
      userId,
      body.role,
    );
    return { data: member };
  }

  /**
   * List all members of a workspace.
   * Requires at least viewer role.
   */
  @Get(':id/members')
  @DashboardAuthWithRole()
  @RequireRole('viewer')
  @ApiOperation({ summary: 'List workspace members' })
  @ApiResponse({ status: 200, description: 'Members listed' })
  async getMembers(
    @Param('id') id: string,
    @CurrentUser() _user: SessionUser,
  ) {
    const members = await this.workspacesService.getMembers(id);
    return { data: members };
  }
}
