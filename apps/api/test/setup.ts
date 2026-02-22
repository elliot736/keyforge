import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { DRIZZLE } from '../src/database/database.module';
import * as schema from '../src/database/schema';
import {
  generateApiKey,
  hashApiKey,
  extractKeyPrefix,
  generateId,
} from '@keyforge/shared';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';

export interface TestContext {
  app: NestFastifyApplication;
  rootKey: string;
  workspaceId: string;
  rootKeyId: string;
  db: PostgresJsDatabase<typeof schema>;
}

/**
 * Bootstrap a full NestJS app with the real AppModule for integration testing.
 * Seeds a test workspace and root key in the database.
 * Requires DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET env vars to be set.
 */
export async function setupTestApp(): Promise<TestContext> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter({ logger: false }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const db = moduleRef.get<PostgresJsDatabase<typeof schema>>(DRIZZLE);

  // Create a test workspace
  const workspaceId = generateId('ws');
  await db.insert(schema.workspaces).values({
    id: workspaceId,
    name: `Test Workspace ${workspaceId}`,
    slug: `test-ws-${workspaceId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
    plan: 'pro',
    enabled: true,
  });

  // Create a root key for authentication
  const rawRootKey = generateApiKey('kf_root');
  const rootKeyHash = hashApiKey(rawRootKey);
  const rootKeyPrefix = extractKeyPrefix(rawRootKey);
  const rootKeyId = generateId('rk');

  await db.insert(schema.rootKeys).values({
    id: rootKeyId,
    workspaceId,
    name: 'E2E Test Root Key',
    keyHash: rootKeyHash,
    prefix: rootKeyPrefix,
    scopes: ['*'],
    enabled: true,
  });

  return {
    app,
    rootKey: rawRootKey,
    workspaceId,
    rootKeyId,
    db,
  };
}

/**
 * Clean up test data and close the app.
 */
export async function teardownTestApp(ctx: TestContext | undefined): Promise<void> {
  if (!ctx) return;
  const { app, db, workspaceId } = ctx;

  // Close app first to stop background workers (BullMQ, crons)
  // before deleting test data they might reference
  try {
    await app.close();
  } catch {
    // Ignore close errors from background workers
  }

  try {
    // Delete all test data in correct order to respect foreign keys
    await db.delete(schema.webhookDeliveries);
    await db
      .delete(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.workspaceId, workspaceId));
    await db
      .delete(schema.usageRecords)
      .where(eq(schema.usageRecords.workspaceId, workspaceId));
    await db
      .delete(schema.auditLog)
      .where(eq(schema.auditLog.workspaceId, workspaceId));
    await db
      .delete(schema.apiKeys)
      .where(eq(schema.apiKeys.workspaceId, workspaceId));
    await db
      .delete(schema.rootKeys)
      .where(eq(schema.rootKeys.workspaceId, workspaceId));
    await db
      .delete(schema.workspaces)
      .where(eq(schema.workspaces.id, workspaceId));
  } catch (err) {
    console.warn('Cleanup warning:', err);
  }
}
