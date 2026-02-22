import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  generateApiKey,
  hashApiKey,
  generateId,
  extractKeyPrefix,
  generateWebhookSecret,
} from '@keyforge/shared';
import {
  workspaces,
  rootKeys,
  apiKeys,
  webhookEndpoints,
} from './schema';

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const client = postgres(databaseUrl);
  const db = drizzle(client);

  console.log('Seeding database...\n');

  // ─── 1. Create demo workspace ──────────────────────────────────────────────

  const workspaceId = 'ws_demo';

  await db.insert(workspaces).values({
    id: workspaceId,
    name: 'Demo Workspace',
    slug: 'demo',
    plan: 'pro',
  });

  console.log('Created workspace: Demo Workspace (ws_demo)\n');

  // ─── 2. Create root key ───────────────────────────────────────────────────

  const rawRootKey = generateApiKey('rk');
  const rootKeyId = generateId('rk');

  await db.insert(rootKeys).values({
    id: rootKeyId,
    workspaceId,
    name: 'Demo Root Key',
    keyHash: hashApiKey(rawRootKey),
    prefix: extractKeyPrefix(rawRootKey),
    scopes: ['*'],
  });

  console.log('Created root key:');
  console.log(`  ID:  ${rootKeyId}`);
  console.log(`  Key: ${rawRootKey}`);
  console.log('  (Save this key — it cannot be retrieved later)\n');

  // ─── 3. Create sample API keys ────────────────────────────────────────────

  const keys: { name: string; raw: string; id: string }[] = [];

  // 3a. Production Key — sliding_window rate limit
  const prodRaw = generateApiKey('sk');
  const prodId = generateId('key');
  await db.insert(apiKeys).values({
    id: prodId,
    workspaceId,
    name: 'Production Key',
    keyHash: hashApiKey(prodRaw),
    prefix: extractKeyPrefix(prodRaw),
    environment: 'live',
    scopes: ['read', 'write'],
    rateLimitMax: 1000,
    rateLimitWindow: 60, // 1 minute in seconds
    metadata: { rateLimitType: 'sliding_window' },
  });
  keys.push({ name: 'Production Key', raw: prodRaw, id: prodId });

  // 3b. LLM Key — token_bucket rate limit with token/spend budgets
  const llmRaw = generateApiKey('sk');
  const llmId = generateId('key');
  await db.insert(apiKeys).values({
    id: llmId,
    workspaceId,
    name: 'LLM Key',
    keyHash: hashApiKey(llmRaw),
    prefix: extractKeyPrefix(llmRaw),
    environment: 'live',
    scopes: ['completions', 'embeddings'],
    rateLimitMax: 500,
    rateLimitWindow: 60,
    metadata: { rateLimitType: 'token_bucket' },
    tokenBudget: 1_000_000,
    spendCapCents: 5000,
  });
  keys.push({ name: 'LLM Key', raw: llmRaw, id: llmId });

  // 3c. Test Key — no rate limit, expires in 30 days
  const testRaw = generateApiKey('sk');
  const testId = generateId('key');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db.insert(apiKeys).values({
    id: testId,
    workspaceId,
    name: 'Test Key',
    keyHash: hashApiKey(testRaw),
    prefix: extractKeyPrefix(testRaw),
    environment: 'test',
    expiresAt,
  });
  keys.push({ name: 'Test Key', raw: testRaw, id: testId });

  // ─── 4. Create webhook endpoint ───────────────────────────────────────────

  const webhookId = generateId('whep');
  const webhookSecret = generateWebhookSecret();

  await db.insert(webhookEndpoints).values({
    id: webhookId,
    workspaceId,
    url: 'https://example.com/webhook',
    description: 'Demo webhook endpoint',
    secret: webhookSecret,
    events: ['key.created', 'key.revoked'],
  });

  console.log(`Created webhook endpoint: ${webhookId}`);
  console.log(`  URL:    https://example.com/webhook`);
  console.log(`  Events: key.created, key.revoked`);
  console.log(`  Secret: ${webhookSecret}\n`);

  // ─── 5. Print summary ─────────────────────────────────────────────────────

  console.log('Created API keys:\n');
  console.log('┌──────────────────┬──────────────────────────┬──────────────────────────────────────────────────┐');
  console.log('│ Name             │ ID                       │ Key                                              │');
  console.log('├──────────────────┼──────────────────────────┼──────────────────────────────────────────────────┤');
  for (const k of keys) {
    console.log(`│ ${k.name.padEnd(16)} │ ${k.id.padEnd(24)} │ ${k.raw.padEnd(48)} │`);
  }
  console.log('└──────────────────┴──────────────────────────┴──────────────────────────────────────────────────┘');

  console.log('\nInstructions:');
  console.log('  1. Use the root key to authenticate management API requests (Authorization: Bearer <root-key>)');
  console.log('  2. Use the API keys above to test key verification via POST /v1/keys.verify');
  console.log('  3. The Production Key has sliding_window rate limiting at 1000 req/min');
  console.log('  4. The LLM Key has token_bucket rate limiting at 500 req/min with a 1M token budget and $50 spend cap');
  console.log('  5. The Test Key is in the test environment and expires in 30 days');
  console.log('  6. Webhook events will be sent to https://example.com/webhook\n');

  await client.end();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
