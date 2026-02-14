import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import { generateId } from '@keyforge/shared';
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from '@keyforge/shared';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
  ) {}

  /**
   * Create a new workspace and add the creating user as owner.
   */
  async create(userId: string, input: CreateWorkspaceInput) {
    // Check slug uniqueness
    const [existing] = await this.db
      .select({ id: schema.workspaces.id })
      .from(schema.workspaces)
      .where(eq(schema.workspaces.slug, input.slug))
      .limit(1);

    if (existing) {
      throw new ConflictException(`Workspace slug "${input.slug}" is already taken`);
    }

    const id = generateId('ws');

    const [workspace] = await this.db
      .insert(schema.workspaces)
      .values({
        id,
        name: input.name,
        slug: input.slug,
        plan: input.plan ?? 'free',
      })
      .returning();

    // Add the creator as owner
    await this.db.insert(schema.workspaceMembers).values({
      workspaceId: id,
      userId,
      role: 'owner',
    });

    return workspace;
  }

  /**
   * Find a workspace by ID.
   */
  async findById(id: string) {
    const [workspace] = await this.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, id))
      .limit(1);

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return workspace;
  }

  /**
   * Find a workspace by slug.
   */
  async findBySlug(slug: string) {
    const [workspace] = await this.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.slug, slug))
      .limit(1);

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return workspace;
  }

  /**
   * Find all workspaces the user is a member of.
   */
  async findByUserId(userId: string) {
    const memberships = await this.db
      .select({
        workspace: schema.workspaces,
        role: schema.workspaceMembers.role,
      })
      .from(schema.workspaceMembers)
      .innerJoin(
        schema.workspaces,
        eq(schema.workspaceMembers.workspaceId, schema.workspaces.id),
      )
      .where(eq(schema.workspaceMembers.userId, userId));

    return memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
    }));
  }

  /**
   * Update a workspace.
   */
  async update(id: string, input: UpdateWorkspaceInput) {
    // If updating slug, check uniqueness
    if (input.slug) {
      const [existing] = await this.db
        .select({ id: schema.workspaces.id })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.slug, input.slug))
        .limit(1);

      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Workspace slug "${input.slug}" is already taken`,
        );
      }
    }

    const [updated] = await this.db
      .update(schema.workspaces)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.slug !== undefined && { slug: input.slug }),
      })
      .where(eq(schema.workspaces.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException('Workspace not found');
    }

    return updated;
  }

  /**
   * Soft delete a workspace by disabling it.
   */
  async delete(id: string) {
    const [updated] = await this.db
      .update(schema.workspaces)
      .set({ enabled: false })
      .where(eq(schema.workspaces.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException('Workspace not found');
    }

    return updated;
  }

  /**
   * Add a member to a workspace.
   */
  async addMember(workspaceId: string, userId: string, role: 'owner' | 'admin' | 'member' | 'viewer') {
    // Verify workspace exists
    await this.findById(workspaceId);

    // Check if already a member
    const [existing] = await this.db
      .select()
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, workspaceId),
          eq(schema.workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictException('User is already a member of this workspace');
    }

    const [member] = await this.db
      .insert(schema.workspaceMembers)
      .values({
        workspaceId,
        userId,
        role,
      })
      .returning();

    return member;
  }

  /**
   * Remove a member from a workspace.
   */
  async removeMember(workspaceId: string, userId: string) {
    // Prevent removing the last owner
    const [member] = await this.db
      .select()
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, workspaceId),
          eq(schema.workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!member) {
      throw new NotFoundException('Member not found in workspace');
    }

    if (member.role === 'owner') {
      // Check if there's another owner
      const owners = await this.db
        .select()
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, workspaceId),
            eq(schema.workspaceMembers.role, 'owner'),
          ),
        );

      if (owners.length <= 1) {
        throw new ForbiddenException(
          'Cannot remove the last owner of a workspace',
        );
      }
    }

    await this.db
      .delete(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, workspaceId),
          eq(schema.workspaceMembers.userId, userId),
        ),
      );
  }

  /**
   * Update a member's role in a workspace.
   */
  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: 'owner' | 'admin' | 'member' | 'viewer',
  ) {
    const [member] = await this.db
      .select()
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, workspaceId),
          eq(schema.workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!member) {
      throw new NotFoundException('Member not found in workspace');
    }

    // Prevent demoting the last owner
    if (member.role === 'owner' && role !== 'owner') {
      const owners = await this.db
        .select()
        .from(schema.workspaceMembers)
        .where(
          and(
            eq(schema.workspaceMembers.workspaceId, workspaceId),
            eq(schema.workspaceMembers.role, 'owner'),
          ),
        );

      if (owners.length <= 1) {
        throw new ForbiddenException(
          'Cannot demote the last owner of a workspace',
        );
      }
    }

    const [updated] = await this.db
      .update(schema.workspaceMembers)
      .set({ role })
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, workspaceId),
          eq(schema.workspaceMembers.userId, userId),
        ),
      )
      .returning();

    return updated;
  }

  /**
   * List all members of a workspace.
   */
  async getMembers(workspaceId: string) {
    const members = await this.db
      .select({
        userId: schema.workspaceMembers.userId,
        role: schema.workspaceMembers.role,
        createdAt: schema.workspaceMembers.createdAt,
      })
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.workspaceId, workspaceId));

    return members;
  }
}
