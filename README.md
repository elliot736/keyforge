<p align="center">
  <h1 align="center">KeyForge</h1>
  <p align="center">
    Open-source API key management for modern APIs.<br/>
    Keys, rate limiting, usage metering, and token-based billing.<br/>
    Ships as a single <code>docker compose up</code>.
  </p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#sdk">SDK</a> &middot;
  <a href="#api-reference">API Reference</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#aws-deployment">Deploy</a>
</p>

<br/>

![KeyForge Dashboard](docs/screenshots/keyforge-dashboard-walkthrough.gif)

<br/>

## Table of Contents

- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [SDK](#sdk)
  - [Middleware](#expressfastifyhononextjs-middleware)
  - [Client Methods](#sdk-client)
- [Rate Limiting vs Token Budgets](#rate-limiting-vs-token-budgets)
- [Embeddable React Portal](#embeddable-react-portal)
- [Verification Flow](#verification-flow)
- [Key Lifecycle](#key-lifecycle)
- [Webhooks](#webhooks)
- [Audit Log](#audit-log)
- [Plans and Limits](#plans-and-limits)
- [API Reference](#api-reference)
  - [Keys](#keys)
  - [Usage](#usage)
  - [Webhooks](#webhooks-1)
  - [Audit](#audit)
  - [Workspaces](#workspaces)
  - [Root Keys](#root-keys)
  - [Billing](#billing)
- [Error Codes](#error-codes)
- [Architecture](#architecture)
  - [Project Structure](#project-structure)
  - [Database Schema](#database-schema)
  - [Background Jobs](#background-jobs)
- [AWS Deployment](#aws-deployment)
  - [Terraform Variables](#terraform-variables)
- [Environment Variables](#environment-variables)
- [Security](#security)
- [Testing](#testing)
  - [Load Tests](#load-tests)
- [Development](#development)
- [License](#license)

---

## Quick Start

```bash
git clone https://github.com/your-username/keyforge.git
cd keyforge
cp .env.example .env
docker compose up -d postgres redis
pnpm install && pnpm run build
```

Push the schema and start everything:

```bash
# Push database schema
DATABASE_URL="postgresql://keyforge:keyforge@localhost:5555/keyforge" \
  pnpm --filter @keyforge/api run db:push

# Start the API (port 4000)
DATABASE_URL="postgresql://keyforge:keyforge@localhost:5555/keyforge" \
REDIS_URL="redis://localhost:6381" \
BETTER_AUTH_SECRET="change-this-to-a-random-64-char-string" \
BETTER_AUTH_URL="http://localhost:3000" \
  pnpm --filter @keyforge/api run start:prod

# Start the dashboard (port 3000)
DATABASE_URL="postgresql://keyforge:keyforge@localhost:5555/keyforge" \
BETTER_AUTH_SECRET="change-this-to-a-random-64-char-string" \
BETTER_AUTH_URL="http://localhost:3000" \
NEXT_PUBLIC_API_URL="http://localhost:4000" \
API_URL="http://localhost:4000" \
  pnpm --filter @keyforge/dashboard run dev
```

Open http://localhost:3000 to access the dashboard. Register an account, create a workspace, and issue your first API key. Swagger docs are at http://localhost:4000/docs.

Seed demo data (workspace, root key, 3 sample API keys, webhook):

```bash
pnpm --filter @keyforge/api run db:seed
```

---

## How It Works

Your API integrates with KeyForge through a root key. Root keys authenticate management operations (creating, revoking, listing keys). The keys your customers receive are verified through a separate public endpoint that requires no authentication on KeyForge's side.

![Integration Flow](docs/screenshots/how-it-works.png)

The verify call checks validity, enforces rate limits, checks token budgets and spend caps, increments usage counters, and returns the full key context. All in a single Redis round trip for cached keys.

---

## SDK

```bash
# Available as a workspace package in the monorepo
# or install directly from GitHub:
npm install github:elliot736/keyforge#main
```

### Express/Fastify/Hono/Next.js Middleware

One line of middleware to protect your entire API:

```typescript
import { KeyForge } from '@keyforge/sdk';
import { keyforgeMiddleware } from '@keyforge/sdk/express';

const kf = new KeyForge({
  apiUrl: 'https://keys.yourapp.com',
  rootKey: 'kf_root_...',
});

app.use('/api', keyforgeMiddleware({ client: kf }));
```

The middleware extracts the API key from the `Authorization: Bearer` header, verifies it, attaches the result to `req.keyforge`, and sets `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers. Returns 401 if the key is missing, 403 if invalid or expired, 429 if rate limited.

Other frameworks:

```typescript
import { keyforgeMiddleware } from '@keyforge/sdk/hono';     // Hono
import { keyforgePlugin } from '@keyforge/sdk/fastify';       // Fastify
import { withKeyForge } from '@keyforge/sdk/nextjs';          // Next.js
```

Custom key extraction:

```typescript
app.use(keyforgeMiddleware({
  client: kf,
  extractKey: (req) => req.headers['x-api-key'] || null,
  onError: (error, req, res) => {
    res.status(403).json({ error: 'Invalid API key' });
  },
}));
```

### SDK Client

```typescript
const kf = new KeyForge({
  apiUrl: 'https://keys.yourapp.com',
  rootKey: 'kf_root_...',
  timeout: 10000,                        // default 10s
  retry: { attempts: 2, delay: 200 },    // default, exponential backoff
});
```

<details>
<summary><strong>All SDK methods</strong></summary>

```typescript
// Create a key
const { key, keyId } = await kf.keys.create({
  name: 'Production Key',
  prefix: 'myapp',                              // optional, default 'sk'
  ownerId: 'user_123',                          // optional, your user ID
  environment: 'production',                     // 'development' | 'staging' | 'production'
  scopes: ['read:models', 'write:completions'],
  meta: { plan: 'pro', team: 'engineering' },   // arbitrary JSON, returned on verify
  rateLimitConfig: {                             // optional
    algorithm: 'sliding_window',                 // 'fixed_window' | 'sliding_window' | 'token_bucket'
    limit: 1000,
    window: 60000,                               // milliseconds
  },
  tokenBudget: 1000000,                         // optional, monthly token cap
  spendCapCents: 5000,                           // optional, monthly spend cap in cents ($50)
  expiresAt: '2026-12-31T23:59:59Z',            // optional, ISO datetime
});
// key is shown once: "myapp_LqzlPB2E1AuekGm5VKPOgndXMwq4ZzjpDKD7MTrDn08"

// Verify a key (public, no root key needed)
const result = await kf.keys.verify({ key: 'myapp_LqzlPB2E...' });
// {
//   valid: true,
//   keyId: 'key_abc123',
//   ownerId: 'user_123',
//   workspaceId: 'ws_xyz',
//   name: 'Production Key',
//   environment: 'live',
//   scopes: ['read:models', 'write:completions'],
//   meta: { plan: 'pro', team: 'engineering' },
//   rateLimit: { limit: 1000, remaining: 994, reset: 1672531200000 },
//   usage: { requests: 6, tokens: 45000 }
// }

// List keys (paginated)
const { keys, total } = await kf.keys.list({
  ownerId: 'user_123',           // optional filter
  environment: 'production',     // optional filter
  limit: 50,                     // 1-100, default 50
  offset: 0,
});

// Get a single key
const keyDetails = await kf.keys.get('key_abc123');

// Update a key
await kf.keys.update('key_abc123', {
  name: 'Renamed Key',
  scopes: ['read'],
  meta: { plan: 'enterprise' },
  tokenBudget: 5000000,
});

// Rotate a key (generates new key, old one stays valid during grace period)
const { key: newKey, keyId: newKeyId } = await kf.keys.rotate({
  keyId: 'key_abc123',
  gracePeriodMs: 300000,         // 5 minutes, default
});

// Revoke a key
await kf.keys.revoke({
  keyId: 'key_abc123',
  gracePeriodMs: 0,              // immediate, default
});

// Report usage (for token-based metering)
await kf.usage.report({
  keyId: 'key_abc123',
  tokens: { input: 1500, output: 800 },
  model: 'gpt-4',
  cost: 0.0234,                  // in dollars, stored as cents
});

// Query usage stats
const stats = await kf.usage.get({
  workspaceId: 'ws_xyz',
  keyId: 'key_abc123',           // optional
  from: '2026-03-01T00:00:00Z',
  to: '2026-03-31T23:59:59Z',
  granularity: 'day',            // 'hour' | 'day' | 'month'
});

// Workspace usage summary
const summary = await kf.usage.summary('ws_xyz');
```

</details>

Errors throw `KeyForgeError` with `code`, `message`, and `status` properties. Client errors (4xx) are not retried. Server errors (5xx) and network failures are retried with exponential backoff.

---

## Rate Limiting vs Token Budgets

KeyForge has two independent limiting systems. Use either or both on the same key.

**Rate limiting** controls requests per time window. Runs on every verify call using atomic Redis Lua scripts. When a key hits its limit, verify returns `{ valid: false, code: 'RATE_LIMITED' }`.

| Algorithm | Use case | Behavior |
|-----------|----------|----------|
| `fixed_window` | Simple request quotas | Counts requests in fixed time windows. Resets at window boundaries. |
| `sliding_window` | Smooth request limiting | Weighted average of current and previous windows. Prevents burst-at-boundary. |
| `token_bucket` | Burst-tolerant APIs | Tokens refill over time up to a max. Allows short bursts while enforcing an average rate. |

**Token budgets and spend caps** control monthly consumption. For AI/LLM APIs where one request generating 10 tokens and another generating 10,000 tokens have wildly different costs. After your API processes a request, you report the actual token count and cost. KeyForge accumulates these in Redis and checks them on the next verify call.

| Check | When it runs | Error code | Reset |
|-------|-------------|------------|-------|
| Rate limit | Every verify | `RATE_LIMITED` | Per window (e.g. every 60s) |
| Token budget | Every verify | `BUDGET_EXCEEDED` | Monthly |
| Spend cap | Every verify | `SPEND_CAP_EXCEEDED` | Monthly |

<details>
<summary><strong>Examples</strong></summary>

Standard REST API key with just rate limiting:

```typescript
await kf.keys.create({
  name: 'REST API Key',
  rateLimitConfig: { algorithm: 'sliding_window', limit: 100, window: 60000 },
});
```

LLM API key with rate limiting, token budget, and spend cap:

```typescript
await kf.keys.create({
  name: 'LLM API Key',
  rateLimitConfig: { algorithm: 'token_bucket', limit: 500, window: 60000 },
  tokenBudget: 1000000,       // 1M tokens/month
  spendCapCents: 5000,        // $50/month
});
```

After processing each LLM request, report usage:

```typescript
await kf.usage.report({
  keyId: 'key_abc',
  tokens: { input: 1500, output: 800 },
  model: 'gpt-4',
  cost: 0.0234,
});
```

</details>

---

## Embeddable React Portal

Let your customers manage their own API keys without you building a UI:

```bash
# Available as a workspace package in the monorepo
```

```tsx
import { KeyPortal } from '@keyforge/react';

<KeyPortal
  apiUrl="https://keys.yourapp.com"
  sessionToken={sessionToken}
  workspaceId="ws_abc123"
  userId="user_456"
  theme={{ mode: 'dark', colors: { primary: '#6366f1' } }}
  onKeyCreated={(key) => console.log('New key:', key.id)}
  onError={(err) => console.error(err)}
/>
```

Renders key table, create/rotate/revoke dialogs, and usage charts. All styles are inline (no CSS conflicts). Works as a React component or in an iframe.

---

## Verification Flow

When `POST /v1/keys.verifyKey` is called with `{ key: "sk_..." }`:

1. SHA-256 hash the raw key
2. Look up the hash in Redis (cache hit) or Postgres (cache miss, then cached for 5 minutes)
3. Check if the key is enabled
4. Check if revoked (respects grace periods set during rotation/revocation)
5. Check if expired
6. Run rate limit algorithm (Redis Lua script, atomic increment-and-check)
7. Check token budget against monthly Redis counter
8. Check spend cap against monthly Redis counter
9. Check usage limit if set (atomic Redis decrement)
10. Increment hourly usage counter (async, fire-and-forget)
11. Update lastUsedAt (async, batched to Postgres every 5 minutes)
12. Read current usage from Redis
13. Return the full response

Steps 6-9 can each reject the request with a different error code. Steps 10-12 never block the response.

![Verify Flow](docs/screenshots/verify-flow.png)

---

## Key Lifecycle

![Key Lifecycle](docs/screenshots/key-lifecycle.png)

---

## Webhooks

Register an endpoint:

```typescript
POST /v1/webhooks
{
  "url": "https://yourapp.com/webhooks/keyforge",
  "events": ["key.created", "key.revoked", "quota.warning", "quota.exceeded"]
}
```

| Event | Fired when |
|-------|-----------|
| `key.created` | A new key is created |
| `key.revoked` | A key is revoked |
| `key.expired` | A key passes its expiration date (checked every 5 minutes) |
| `key.rotated` | A key is rotated |
| `key.rate_limited` | A key hits its rate limit |
| `quota.warning` | Token/spend usage reaches 80% or 90% of the budget |
| `quota.exceeded` | Token/spend usage hits 100% of the budget |
| `usage.report` | Periodic usage summary |

<details>
<summary><strong>Delivery format and signing</strong></summary>

Each delivery is a POST request:

```json
{
  "id": "whdl_abc123",
  "event": "key.created",
  "timestamp": "2026-03-20T17:23:47Z",
  "data": {
    "keyId": "key_xyz",
    "name": "Production Key",
    "environment": "production"
  }
}
```

Signed with HMAC-SHA256. Headers:

```
Webhook-Signature: v1,<hex-encoded-hmac>
Webhook-Id: whdl_abc123
Webhook-Timestamp: 1672531200
```

Failed deliveries are retried with exponential backoff (1s, 2s, 4s, 8s, 16s) up to 5 attempts. After 5 failures the endpoint is automatically disabled.

</details>

---

## Audit Log

Every management action is logged: key creation, revocation, rotation, updates, webhook changes, member changes. Each entry records the actor, action, resource, timestamp, and a metadata payload.

```
GET /v1/audit-logs?action=key.created&from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z&limit=50
GET /v1/audit-logs/export
```

Retention is plan-based: 30 days on free, 365 days on pro, unlimited on enterprise. A daily cleanup job enforces this.

---

## Plans and Limits

| | Free | Pro | Enterprise |
|---|------|-----|-----------|
| API keys | 100 | 1,000 | Unlimited |
| Verifications/month | 100,000 | 10,000,000 | Unlimited |
| Webhooks | 3 | 10 | Unlimited |
| Rate limit ceiling | 100/min | 10,000/min | Unlimited |
| Token budget | 1M | 100M | Unlimited |
| Audit retention | 30 days | 365 days | Unlimited |

---

## API Reference

All management endpoints require a root key in the `Authorization: Bearer` header. The verify endpoint is public.

### Keys

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/keys.createKey` | Create a new API key |
| `POST` | `/v1/keys.verifyKey` | Verify a key (public, no auth) |
| `POST` | `/v1/keys.revokeKey` | Revoke a key |
| `POST` | `/v1/keys.rotateKey` | Rotate a key |
| `GET` | `/v1/keys` | List keys |
| `GET` | `/v1/keys/:keyId` | Get key details |
| `PATCH` | `/v1/keys/:keyId` | Update key |

### Usage

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/usage.report` | Report token/request usage |
| `GET` | `/v1/usage` | Query usage time series |
| `GET` | `/v1/usage/summary` | Workspace usage summary |

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/webhooks` | Create webhook |
| `GET` | `/v1/webhooks` | List webhooks |
| `GET` | `/v1/webhooks/:id` | Get webhook |
| `PATCH` | `/v1/webhooks/:id` | Update webhook |
| `DELETE` | `/v1/webhooks/:id` | Delete webhook |
| `GET` | `/v1/webhooks/:id/deliveries` | Delivery history |
| `POST` | `/v1/webhooks/:id/deliveries/:deliveryId/retry` | Retry a delivery |

### Audit

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/audit-logs` | Query audit logs |
| `GET` | `/v1/audit-logs/export` | Export as JSON |
| `GET` | `/v1/audit-logs/:id` | Get single entry |

### Workspaces

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/workspaces` | Session | Create workspace |
| `GET` | `/v1/workspaces` | Session | List your workspaces |
| `GET` | `/v1/workspaces/:id` | Session (viewer+) | Get workspace |
| `PATCH` | `/v1/workspaces/:id` | Session (admin+) | Update workspace |
| `DELETE` | `/v1/workspaces/:id` | Session (owner) | Delete workspace |
| `POST` | `/v1/workspaces/:id/members` | Session (admin+) | Add member |
| `DELETE` | `/v1/workspaces/:id/members/:userId` | Session (admin+) | Remove member |
| `PATCH` | `/v1/workspaces/:id/members/:userId` | Session (owner) | Change role |
| `GET` | `/v1/workspaces/:id/members` | Session (viewer+) | List members |

### Root Keys

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/auth/:workspaceId/root-keys` | Session (admin+) | Create root key |
| `GET` | `/v1/auth/:workspaceId/root-keys` | Session (admin+) | List root keys |
| `DELETE` | `/v1/auth/:workspaceId/root-keys/:id` | Session (admin+) | Revoke root key |

### Billing

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/v1/billing/checkout` | Session (admin+) | Create Stripe checkout |
| `POST` | `/v1/billing/portal` | Session (admin+) | Stripe customer portal |
| `GET` | `/v1/billing/subscription` | Session (member+) | Get subscription info |
| `POST` | `/v1/webhooks/stripe` | Stripe signature | Stripe webhook receiver |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | DB and Redis status. 200 if healthy, 503 if not. |
| `GET` | `/docs` | Swagger UI |

---

## Error Codes

Verify endpoint returns these codes when `valid` is `false`:

| Code | Meaning |
|------|---------|
| `KEY_NOT_FOUND` | No key matches the provided hash |
| `KEY_REVOKED` | Key has been revoked (and grace period has passed) |
| `KEY_EXPIRED` | Key has passed its expiration date |
| `RATE_LIMITED` | Key has exceeded its request rate limit |
| `BUDGET_EXCEEDED` | Key has exceeded its monthly token budget |
| `SPEND_CAP_EXCEEDED` | Key has exceeded its monthly spend cap |

Management endpoints return standard HTTP error codes with `{ code, message, requestId }` bodies.

---

## Architecture

![System Architecture](docs/screenshots/architecture.png)

| Layer | Technology | Why |
|-------|-----------|-----|
| API | NestJS + Fastify | Modular architecture, Fastify for lower verify latency |
| Dashboard | Next.js 15 (App Router) | Server components, better-auth sessions |
| Database | PostgreSQL 16 | JSONB for metadata, strong indexing |
| Cache | Redis 7 | Sub-ms lookups, Lua scripts for atomic rate limiting |
| ORM | Drizzle | Type-safe, SQL-close, no runtime overhead |
| Queue | BullMQ | Webhook delivery and usage aggregation |
| Validation | Zod | Shared schemas between API and SDK |
| UI | Tailwind + shadcn/ui | Dashboard components |
| Monorepo | Turborepo + pnpm | Build orchestration across 5 packages |

### Project Structure

```
keyforge/
├── apps/
│   ├── api/                  # NestJS backend
│   │   └── src/
│   │       ├── keys/         # Key CRUD and business logic
│   │       ├── verify/       # Verification hot path
│   │       ├── ratelimit/    # Redis Lua rate limit scripts
│   │       ├── usage/        # Metering, aggregation workers, expiration cron
│   │       ├── webhooks/     # Webhook delivery queue and processor
│   │       ├── audit/        # Audit logging
│   │       ├── billing/      # Stripe integration
│   │       ├── auth/         # Root key and session guards
│   │       ├── workspaces/   # Multi-tenant workspace management
│   │       └── database/     # Drizzle schema
│   └── dashboard/            # Next.js admin UI
├── packages/
│   ├── shared/               # Types, Zod schemas, constants, crypto utils
│   ├── sdk/                  # Node.js client + middleware (Express, Fastify, Hono, Next.js)
│   └── react/                # Embeddable key portal component
├── tests/
│   └── load/                 # k6 load tests for verify endpoint
├── infra/
│   └── terraform/            # AWS infrastructure (ECS Fargate, RDS, ElastiCache, ALB)
├── .github/
│   └── workflows/            # CI, deploy, and Terraform pipelines
├── docker/                   # Multi-stage Dockerfiles
└── docker-compose.yml
```

### Database Schema

![Database ERD](docs/screenshots/database-erd.png)

### Background Jobs

| Job | Schedule | What it does |
|-----|----------|-------------|
| Flush usage counters | Every minute | Reads hourly usage buckets from Redis, writes to Postgres |
| Sync lastUsedAt | Every 5 minutes | Batch-updates key lastUsedAt from Redis to Postgres |
| Expire keys | Every 5 minutes | Finds expired keys, disables them, fires key.expired webhook |
| Audit cleanup | Daily at 3am | Deletes audit entries exceeding the plan's retention period |

---

## AWS Deployment

The same Docker images that run locally deploy to AWS with no code changes. Terraform provisions everything.

![AWS Infrastructure](docs/screenshots/aws-infra.png)

<details>
<summary><strong>Terraform file breakdown</strong></summary>

```
infra/terraform/
├── vpc.tf              # VPC, 2 public + 2 private subnets, NAT gateway
├── security.tf         # Security groups (ALB, ECS, RDS, Redis)
├── ecr.tf              # ECR repos with image scanning and lifecycle policies
├── rds.tf              # PostgreSQL 16 (encrypted, gp3, multi-AZ in prod)
├── elasticache.tf      # Redis 7.1 with allkeys-lru
├── secrets.tf          # Secrets Manager for DB URL, Redis URL, auth secrets
├── alb.tf              # ALB with health-checked target groups
├── acm.tf              # TLS certificate + HTTPS listener (when domain is set)
├── ecs.tf              # Fargate cluster, task definitions, services with circuit breakers
├── autoscaling.tf      # CPU and request-based auto-scaling
├── monitoring.tf       # CloudWatch alarms, SNS alerts, ops dashboard
└── bootstrap/main.tf   # S3 state bucket + DynamoDB lock table (run once)
```

</details>

Deploy:

```bash
# 1. Bootstrap state backend (once)
cd infra/terraform/bootstrap
terraform init && terraform apply

# 2. Deploy infrastructure
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
terraform init && terraform apply

# 3. Build and push images
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

docker build -f docker/Dockerfile.api -t <ecr-url>/keyforge-prod-api:latest .
docker push <ecr-url>/keyforge-prod-api:latest

docker build -f docker/Dockerfile.dashboard -t <ecr-url>/keyforge-prod-dashboard:latest .
docker push <ecr-url>/keyforge-prod-dashboard:latest
```

After the first deploy, CI/CD handles everything:

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | PR and push to main | Builds all packages, runs 72 tests (unit + integration), typechecks |
| `deploy.yml` | After CI passes on main | Builds images with layer caching, pushes to ECR, ECS rolling deploy, health verification |
| `terraform.yml` | Changes to `infra/` | Plan on PRs (posts as PR comment), apply on merge with environment approval |

Deploy only runs after CI passes. Manual deploys available via `workflow_dispatch` with environment selection (prod/staging).

### Terraform Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `aws_region` | `us-east-1` | AWS region |
| `environment` | `prod` | Environment name |
| `project` | `keyforge` | Project name prefix |
| `domain` | (empty) | Custom domain for HTTPS |
| `db_instance_class` | `db.t4g.micro` | RDS instance size |
| `redis_node_type` | `cache.t4g.micro` | ElastiCache node size |
| `api_cpu` / `api_memory` | `512` / `1024` | API task resources |
| `api_desired_count` | `2` | Number of API containers |
| `dashboard_cpu` / `dashboard_memory` | `256` / `512` | Dashboard task resources |
| `dashboard_desired_count` | `2` | Number of dashboard containers |
| `enable_deletion_protection` | `true` | Prevent accidental deletion of RDS and ALB |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | | PostgreSQL connection string |
| `REDIS_URL` | Yes | | Redis connection URL |
| `BETTER_AUTH_SECRET` | Yes | | Auth secret, minimum 16 characters |
| `BETTER_AUTH_URL` | No | `http://localhost:3000` | Base URL for auth |
| `API_PORT` | No | `4000` | Port the API listens on |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origins, comma-separated |
| `STRIPE_SECRET_KEY` | No | | Stripe secret key for billing |
| `STRIPE_WEBHOOK_SECRET` | No | | Stripe webhook signing secret |
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:4000` | API URL for dashboard frontend |
| `API_URL` | No | `http://localhost:4000` | API URL for dashboard server components |
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |

---

## Security

- Keys are SHA-256 hashed before storage. Raw key returned once at creation, never stored or logged.
- Hash lookups use constant-time comparison to prevent timing attacks.
- Root keys authenticate management endpoints. Verify is intentionally unauthenticated (the API key is the credential).
- Webhook payloads signed with HMAC-SHA256, per-endpoint secret, timestamp in headers.
- All input validated at the API boundary with Zod. Drizzle ORM parameterizes every query.
- Secrets loaded from env vars, validated at startup. Missing secrets prevent the API from starting.
- Workspace access uses role hierarchy: owner > admin > member > viewer.
- Every mutation recorded in the audit log with actor, action, resource, and metadata.

---

## Testing

72 tests across three layers:

```bash
# Shared package (14 tests: crypto utils, ID generation, HMAC signing)
pnpm --filter @keyforge/shared run test

# API unit tests (28 tests: verify service, keys service, rate limiter)
pnpm --filter @keyforge/api run test

# API integration tests (30 tests: full HTTP endpoint tests against real Postgres + Redis)
pnpm --filter @keyforge/api run test:e2e
```

Unit tests mock Redis and Postgres. Integration tests bootstrap a full NestJS app and hit every endpoint: key CRUD, verification, rate limiting, usage reporting, webhooks, audit logs, and auth guards.

### Load Tests

Verify the sub-5ms p95 latency target with k6:

```bash
# Install k6: https://k6.io/docs/get-started/installation/
API_URL=http://localhost:4000 API_KEY=sk_your_key k6 run tests/load/verify.k6.js
```

Runs a smoke test (10 VUs, 30s) followed by a ramp to 200 concurrent users. Thresholds: p95 < 10ms, p99 < 25ms, error rate < 1%.

---

## Development

```bash
pnpm install
pnpm run dev          # Start all packages in watch mode
pnpm run build        # Production build
pnpm run typecheck    # Type checking
pnpm run lint         # Linting
```

Database:

```bash
pnpm --filter @keyforge/api run db:push      # Push schema to DB
pnpm --filter @keyforge/api run db:generate  # Generate migration files
pnpm --filter @keyforge/api run db:migrate   # Run migrations
pnpm --filter @keyforge/api run db:seed      # Seed demo data
```

---

## License

MIT
