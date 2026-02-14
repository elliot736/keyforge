import {
  Injectable,
  Inject,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE } from '../database/database.module';
import * as schema from '../database/schema';
import {
  generateApiKey,
  hashApiKey,
  extractKeyPrefix,
  generateId,
} from '@keyforge/shared';

export interface RootKeyContext {
  rootKeyId: string;
  workspaceId: string;
  scopes: string[];
}

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Validate a root key for programmatic API access.
   * Hashes the provided key, looks it up in the root_keys table,
   * and returns workspace context if valid.
   */
  async validateRootKey(key: string): Promise<RootKeyContext> {
    const keyHash = hashApiKey(key);

    const [rootKey] = await this.db
      .select()
      .from(schema.rootKeys)
      .where(eq(schema.rootKeys.keyHash, keyHash))
      .limit(1);

    if (!rootKey) {
      throw new UnauthorizedException('Invalid root key');
    }

    if (!rootKey.enabled) {
      throw new UnauthorizedException('Root key has been revoked');
    }

    if (rootKey.expiresAt && rootKey.expiresAt < new Date()) {
      throw new UnauthorizedException('Root key has expired');
    }

    // Update lastUsedAt in the background (fire-and-forget)
    this.db
      .update(schema.rootKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.rootKeys.id, rootKey.id))
      .execute()
      .catch((err) =>
        this.logger.warn(`Failed to update root key lastUsedAt: ${err.message}`),
      );

    return {
      rootKeyId: rootKey.id,
      workspaceId: rootKey.workspaceId,
      scopes: rootKey.scopes ?? [],
    };
  }

  /**
   * Create a new root key for a workspace.
   * Returns the raw key exactly once -- it is never stored.
   */
  async createRootKey(
    workspaceId: string,
    name: string,
    scopes: string[],
  ): Promise<{ id: string; key: string; prefix: string }> {
    const rawKey = generateApiKey('kf_root');
    const keyHash = hashApiKey(rawKey);
    const prefix = extractKeyPrefix(rawKey);
    const id = generateId('rk');

    await this.db.insert(schema.rootKeys).values({
      id,
      workspaceId,
      name,
      keyHash,
      prefix,
      scopes,
      enabled: true,
    });

    return { id, key: rawKey, prefix };
  }

  /**
   * List all root keys for a workspace (never returns the hash).
   */
  async listRootKeys(workspaceId: string) {
    const keys = await this.db
      .select({
        id: schema.rootKeys.id,
        name: schema.rootKeys.name,
        prefix: schema.rootKeys.prefix,
        scopes: schema.rootKeys.scopes,
        enabled: schema.rootKeys.enabled,
        expiresAt: schema.rootKeys.expiresAt,
        lastUsedAt: schema.rootKeys.lastUsedAt,
        createdAt: schema.rootKeys.createdAt,
      })
      .from(schema.rootKeys)
      .where(eq(schema.rootKeys.workspaceId, workspaceId));

    return keys;
  }

  /**
   * Revoke a root key by disabling it.
   */
  async revokeRootKey(id: string, workspaceId: string): Promise<void> {
    const [rootKey] = await this.db
      .select()
      .from(schema.rootKeys)
      .where(
        and(eq(schema.rootKeys.id, id), eq(schema.rootKeys.workspaceId, workspaceId)),
      )
      .limit(1);

    if (!rootKey) {
      throw new UnauthorizedException('Root key not found');
    }

    await this.db
      .update(schema.rootKeys)
      .set({ enabled: false })
      .where(eq(schema.rootKeys.id, id));
  }

  /**
   * Validate a session token from better-auth.
   * Makes an HTTP call to the better-auth server to verify the session.
   */
  async validateSession(token: string): Promise<SessionUser> {
    const betterAuthUrl = this.config.get<string>('BETTER_AUTH_URL');

    try {
      const response = await fetch(`${betterAuthUrl}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Cookie: `better-auth.session_token=${token}`,
        },
      });

      if (!response.ok) {
        throw new UnauthorizedException('Invalid session');
      }

      const data = (await response.json()) as {
        user?: { id: string; email: string; name?: string };
      };

      if (!data.user) {
        throw new UnauthorizedException('Invalid session');
      }

      return {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Session validation failed: ${error}`);
      throw new UnauthorizedException('Session validation failed');
    }
  }

  /**
   * Get user's role in a workspace.
   */
  async getWorkspaceRole(
    workspaceId: string,
    userId: string,
  ): Promise<string | null> {
    const [member] = await this.db
      .select({ role: schema.workspaceMembers.role })
      .from(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, workspaceId),
          eq(schema.workspaceMembers.userId, userId),
        ),
      )
      .limit(1);

    return member?.role ?? null;
  }
}
