# Design Document — business-modules-core

## Overview

This document covers the technical design for the five core business modules that elevate GateCtr from a basic API proxy to a production-grade LLM middleware platform:

1. **Context Optimizer** — 4-technique prompt compression pipeline targeting ≥40% token reduction
2. **Model Router & LLM Adapters** — scoring-based model selection with unified adapters for OpenAI, Anthropic, Mistral, and Gemini
3. **Webhook Engine** — BullMQ-backed async dispatcher with HMAC-SHA256 signing, retry logic, and exponential backoff
4. **Analytics Queue** — BullMQ async usage ingestion pipeline decoupling the hot path from DB writes
5. **Usage & Consumption Analytics** — REST API + dashboard (Recharts, TanStack Table, date range presets)

All modules integrate with the existing infrastructure: Prisma 7 / PostgreSQL (Neon Serverless), Upstash Redis, BullMQ / IORedis, Clerk auth, and Stripe billing. Plan gating follows the established hierarchy: Free (50K tokens/month) → Pro (2M) → Team (10M) → Enterprise (unlimited).

---

## Architecture

### Gateway Pipeline

Every LLM request flows through a linear pipeline. Each stage is independently skippable (plan gate or error fallback) without breaking the chain.

```
Incoming Request (POST /api/v1/chat or /api/v1/complete)
        │
        ▼
┌───────────────────┐
│   1. Plan_Guard   │  checkBudget() + checkQuota()  →  HTTP 429 if blocked
└────────┬──────────┘
         │ allowed
         ▼
┌────────────────────────┐
│  2. Context_Optimizer  │  lib/optimizer.ts  (Pro+ only, skip if disabled)
│  whitespace → dedup    │  returns { request, savedTokens }
│  → prune → sys-compress│
└────────┬───────────────┘
         │
         ▼
┌────────────────────┐
│  3. Model_Router   │  lib/router.ts  (Pro+ only, skip if disabled)
│  score candidates  │  returns { model, routed }
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│  4. LLM_Adapter    │  lib/llm/{openai,anthropic,mistral,gemini}.ts
│  provider call     │  returns GatewayResponse
└────────┬───────────┘
         │
         ▼
┌──────────────────────┐
│  5. Analytics_Queue  │  enqueue job → BullMQ `analytics` queue (fire-and-forget)
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│  6. Webhook_Engine   │  enqueue job → BullMQ `webhooks` queue (fire-and-forget)
└────────┬─────────────┘
         │
         ▼
     HTTP Response
```

### Worker Architecture

```
workers/index.ts  (entry point — pnpm workers)
    ├── webhook.worker.ts   concurrency=10, timeout=30s
    │       └── fetches Webhook records → HMAC sign → HTTP POST → WebhookDelivery
    └── analytics.worker.ts concurrency=20
            └── creates UsageLog → upserts DailyUsageCache → recordBudgetUsage()
```

### Queue Topology

```
Upstash Redis (IORedis)
    ├── Queue: "webhooks"   (BullMQ)
    │       jobs: { webhookId, event, payload, deliveryId }
    └── Queue: "analytics"  (BullMQ)
            jobs: { userId, projectId, apiKeyId, model, provider,
                    promptTokens, completionTokens, totalTokens,
                    savedTokens, costUsd, latencyMs, statusCode,
                    optimized, routed, fallback, ipAddress }
```

---

## Components and Interfaces

### 1. Context Optimizer (`lib/optimizer.ts`)

Replaces the existing stub. Implements a 4-stage pipeline:

```
Stage 1: Whitespace Normalization
  - Collapse runs of ≥2 spaces/tabs to single space
  - Strip leading/trailing whitespace per message
  - Normalize line endings

Stage 2: Duplicate Message Deduplication
  - Hash each message content (SHA-256 of trimmed content)
  - Remove exact duplicates keeping the last occurrence
  - Preserve role ordering

Stage 3: Semantic Pruning
  - Remove filler phrases ("As an AI language model...", "Certainly!", etc.)
  - Strip repeated instruction fragments (same sentence appearing >1 time)
  - Configurable via OptimizationRule records (ruleType="pruning")

Stage 4: System Prompt Compression
  - Identify system messages
  - Apply whitespace + dedup + pruning to system content
  - Truncate to 80% of original if still above threshold
```

**Public interface** (extends existing stub):

```typescript
export interface OptimizeResult {
  request: GatewayRequest;
  savedTokens: number;
  originalTokens: number;
  optimizedTokens: number;
  techniques: string[];
  durationMs: number;
}

export async function optimize(
  request: GatewayRequest,
): Promise<OptimizeResult>
```

Token estimation: character count ÷ 4 (fallback). Uses `cl100k_base` via `tiktoken` when available.

After optimization, writes an `OptimizationLog` record (fire-and-forget, never throws).

### 2. Model Router (`lib/router.ts`)

Replaces the existing stub. Scoring formula:

```
score = (costWeight * normalizedCost)
      + (latencyWeight * normalizedLatency)
      - (complexityMatch * 0.3)
```

Lower score = better candidate. Weights default: `costWeight=0.6`, `latencyWeight=0.4`.

Complexity estimation from total message character count:
- `< 500` → `low`
- `500–2000` → `medium`
- `> 2000` → `high`

Normalization: min-max across all active `ModelCatalog` entries for the user's available providers.

**Public interface** (extends existing stub):

```typescript
export interface RouteResult {
  model: string;
  routed: boolean;
  scoringDurationMs: number;
}

export async function route(
  request: GatewayRequest,
  userId: string,
): Promise<RouteResult>
```

Only considers models where the user has an active `LLMProviderKey` for the model's provider. Falls back to original model on any exception.

### 3. LLM Adapters (`lib/llm/`)

Each adapter implements:

```typescript
export interface LLMAdapter {
  complete(params: GatewayRequest, apiKey: string): Promise<GatewayResponse>;
  chat(params: GatewayRequest, apiKey: string): Promise<GatewayResponse>;
}
```

Provider-specific translations:
- **Anthropic**: `role: "system"` messages → `system` parameter; excluded from `messages[]`
- **Gemini**: `role: "assistant"` → `"model"` in `contents[]`
- **Mistral**: standard OpenAI-compatible format
- **OpenAI**: native format

All adapters read `baseUrl` and `defaultTimeout` from `LLMProviderConfig` (DB, cached in Redis 5min TTL). Retry logic lives in the gateway layer, not the adapter.

Gateway retry wrapper:
```
attempt 1..maxRetries:
  delay = retryDelay * attemptNumber (ms)
  on ProviderError(retryable=true) → wait + retry
  on ProviderError(retryable=false) → throw immediately
after all retries exhausted:
  if user has fallback provider key → try fallback adapter
  else → throw last error
```

### 4. Webhook Engine (`lib/webhooks.ts` + `workers/webhook.worker.ts`)

`dispatchWebhook()` is refactored to enqueue a BullMQ job instead of making synchronous HTTP calls:

```typescript
// lib/webhooks.ts (new implementation)
export async function dispatchWebhook(
  userId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void>
// Enqueues job, returns immediately. Never throws.
```

Worker job processing:
1. Fetch all active `Webhook` records for `userId` where `events` contains `event` or `["*"]`
2. For each webhook:
   a. Build canonical payload: `{ event, project_id, timestamp, data }`
   b. Compute HMAC: `hmac-sha256=` + hex(HMAC-SHA256(secret, JSON.stringify(payload)))
   c. POST with headers: `X-GateCtr-Signature`, `X-GateCtr-Event`, `X-GateCtr-Delivery` (UUID v4), `Content-Type: application/json`
   d. 10s HTTP timeout, no redirect following
   e. On 5xx/network error: retry with exponential backoff (1s, 2s, 4s, 8s, 16s)
   f. On 4xx (except 429): fail immediately, no retry
   g. On 429: retry after `Retry-After` header duration
   h. Write `WebhookDelivery` record after each attempt
   i. On success: increment `Webhook.successCount`, update `Webhook.lastFiredAt`
   j. On exhausted retries: increment `Webhook.failCount`; if `failCount > 10` → set `isActive = false`

### 5. Analytics Queue (`workers/analytics.worker.ts`)

New worker file. Job payload:

```typescript
interface AnalyticsJobData {
  userId: string;
  projectId?: string;
  apiKeyId?: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  savedTokens: number;
  costUsd: number;
  latencyMs: number;
  statusCode: number;
  optimized: boolean;
  routed: boolean;
  fallback: boolean;
  ipAddress?: string;
}
```

Worker processing:
1. Validate: `costUsd >= 0`, `totalTokens >= 0`, `totalTokens == promptTokens + completionTokens` (log warning + correct if mismatch)
2. Create `UsageLog` record
3. Upsert `DailyUsageCache` on `(userId, projectId, date)` — increment all counters
4. Call `recordBudgetUsage()` (re-evaluates threshold alerts)
5. On failure: retry 3× with 2s delay; capture to Sentry after exhaustion

Fallback: if Redis/BullMQ is unavailable at enqueue time, the gateway falls back to direct synchronous `UsageLog` creation and logs a warning.

### 6. Usage API (`app/api/v1/usage/route.ts`)

Extends the existing implementation to add:
- `byProvider` array (grouped from `UsageLog` since `DailyUsageCache` has no provider field)
- `GET /api/v1/usage/trends` — daily data points for date range
- Plan gating: omit `byModel`, `byProvider`, trends when `advancedAnalytics=false`

### 7. Webhook Management API

New routes under `app/api/v1/webhooks/`:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/webhooks` | Create webhook (validates HTTPS URL, generates `whsec_` secret) |
| GET | `/api/v1/webhooks` | List user's webhooks (no `secret` field) |
| PATCH | `/api/v1/webhooks/[id]` | Update name/url/events/headers/isActive |
| DELETE | `/api/v1/webhooks/[id]` | Soft-delete (set isActive=false) |
| GET | `/api/v1/webhooks/[id]/deliveries` | Last 50 deliveries |
| POST | `/api/v1/webhooks/[id]/test` | Enqueue test job |

### 8. Analytics Dashboard (`app/[locale]/(dashboard)/analytics/`)

Component tree:

```
analytics/page.tsx (Server Component — fetches initial data)
└── AnalyticsDashboard (Client Component — Zustand store for date range)
    ├── SummaryRow
    │   ├── StatCard (totalTokens)
    │   ├── StatCard (totalRequests)
    │   ├── StatCard (totalCostUsd — formatted $0.0000)
    │   └── StatCard (savedTokens)
    ├── BudgetProgressBar (conditional — amber >threshold, red at 100%)
    ├── DateRangePicker (presets: Last 7d, Last 30d, This month, Last month)
    ├── TokenTrendChart (Recharts LineChart — 30-day daily data) [Pro+]
    ├── ModelBreakdownTable (TanStack Table — model/provider/tokens/cost/saved) [Pro+]
    └── UpsellPrompt (shown to Free users in place of Pro components)
```

### 9. Webhook Dashboard (`app/[locale]/(dashboard)/webhooks/`)

Component tree:

```
webhooks/page.tsx
└── WebhooksDashboard (Client Component)
    ├── QuotaBadge ("1 of 1 webhooks used")
    ├── CreateWebhookForm (name, HTTPS url, events multi-select)
    │   └── SecretReveal (shown once at creation, copy button + warning)
    ├── WebhookList
    │   └── WebhookRow (per webhook)
    │       ├── StatusBadge (isActive toggle)
    │       ├── FailCountBadge (warning if failCount > 5)
    │       ├── DeliveryHistory (last 10 attempts)
    │       └── TestButton → POST /api/v1/webhooks/[id]/test
    └── EmptyState
```

---

## Data Models

All models already exist in `prisma/schema.prisma`. No new models are required — the schema already includes `OptimizationLog`, `WebhookDelivery`, `DailyUsageCache`, `ModelCatalog`, and `LLMProviderConfig`.

Schema additions needed (fields missing from existing models):

### `WebhookDelivery` — add `deliveryId` field

```prisma
model WebhookDelivery {
  // existing fields...
  deliveryId String @default(cuid()) // UUID for X-GateCtr-Delivery header
}
```

### `UsageLog` — add `provider` index for byProvider groupBy

```prisma
@@index([userId, provider, createdAt])
```

### `DailyUsageCache` — add `provider` field for provider-level aggregation

```prisma
model DailyUsageCache {
  // existing fields...
  // Note: provider-level breakdown comes from UsageLog groupBy, not DailyUsageCache
  // No schema change needed — byProvider queries hit UsageLog directly
}
```

The existing schema is complete. The migration only needs to add `deliveryId` to `WebhookDelivery` and the composite index on `UsageLog`.

---

## API Route Design

### `GET /api/v1/usage` (extended)

Response shape:

```typescript
{
  totalTokens: number;
  totalRequests: number;
  totalCostUsd: number;
  savedTokens: number;
  from: string;          // "YYYY-MM-DD"
  to: string;
  byModel: Array<{       // Pro+ only
    model: string;
    provider: string;
    totalTokens: number;
    totalRequests: number;
    totalCostUsd: number;
    savedTokens: number;
  }>;
  byProvider: Array<{    // Pro+ only
    provider: string;
    totalTokens: number;
    totalRequests: number;
    totalCostUsd: number;
  }>;
  budgetStatus?: {
    maxTokensPerMonth: number | null;
    maxCostPerMonth: number | null;
    tokensUsed: number;
    costUsed: number;
    tokensPct: number;
    alertThresholdPct: number;
    hardStop: boolean;
  };
}
```

### `GET /api/v1/usage/trends`

Query params: `from`, `to`, `projectId` (same as `/usage`)

Response:

```typescript
{
  trends: Array<{
    date: string;          // "YYYY-MM-DD"
    totalTokens: number;
    totalRequests: number;
    totalCostUsd: number;
    savedTokens: number;
  }>;
}
```

Source: `DailyUsageCache` grouped by `date`. Pro+ only — returns 403 with `{ error: "plan_required" }` for Free users.

### Worker Entry Point (`workers/index.ts`)

```typescript
// Starts both workers, handles SIGTERM/SIGINT gracefully
import { webhookWorker } from './webhook.worker';
import { analyticsWorker } from './analytics.worker';

process.on('SIGTERM', async () => {
  await Promise.all([webhookWorker.close(), analyticsWorker.close()]);
  process.exit(0);
});
```

`package.json` script: `"workers": "tsx workers/index.ts"`

---

## Error Handling

### Gateway Pipeline Errors

| Stage | Error | Behavior |
|-------|-------|----------|
| Plan_Guard | DB unavailable | Fail-open (allow request), log warning |
| Context_Optimizer | Any exception | Log error, skip optimization, forward original request |
| Model_Router | Any exception | Log error, skip routing, use original model |
| LLM_Adapter | ProviderError(retryable=true) | Retry up to `maxRetries` with backoff |
| LLM_Adapter | ProviderError(retryable=false) | Return error immediately |
| LLM_Adapter | All retries exhausted | Try fallback provider if available, else 502 |
| Analytics_Queue | Redis unavailable | Synchronous UsageLog write, log warning |
| Webhook_Engine | Redis unavailable | Log warning, skip enqueue (best-effort) |

### Worker Errors

| Worker | Error | Behavior |
|--------|-------|----------|
| Webhook_Worker | HTTP 5xx / network | Exponential backoff retry (5 attempts) |
| Webhook_Worker | HTTP 4xx (not 429) | Fail immediately, record delivery |
| Webhook_Worker | Job exhausted | Capture to Sentry, increment failCount |
| Analytics_Worker | DB write failure | Retry 3× with 2s delay |
| Analytics_Worker | Job exhausted | Capture to Sentry |
| Both workers | Redis disconnect | Reconnect with exponential backoff, up to 10 retries |

### API Error Responses

All API routes return structured errors:

```typescript
{ error: string; code?: string; details?: unknown }
```

Standard HTTP status codes: 400 (validation), 401 (unauthenticated), 403 (ownership), 404 (not found), 429 (quota exceeded), 500 (internal).

---

## Security Considerations

- **HMAC Signatures**: Webhook payloads signed with `hmac-sha256=hex(HMAC-SHA256(secret, body))`. Secret stored in DB, never returned in list API responses.
- **HTTPS enforcement**: Webhook URLs validated as HTTPS before enqueue. HTTP URLs rejected with 400.
- **No redirect following**: Webhook worker sets `redirect: "error"` on fetch to prevent SSRF via redirect chains.
- **Response body truncation**: Delivery responses > 1MB truncated to 1MB + `[truncated]` suffix.
- **10s HTTP timeout**: All webhook delivery requests time out after 10 seconds.
- **Content isolation**: Context_Optimizer never logs or persists message content. OptimizationLog stores only token counts and technique names.
- **Routing score opacity**: Model_Router never exposes `score` values or weights in API responses.
- **User ownership enforcement**: All webhook and usage API operations validate `userId` ownership before returning data.
- **API key encryption**: `LLMProviderKey.encryptedApiKey` uses AES encryption via `lib/encryption.ts`.
- **Plan cache invalidation**: Redis plan limit cache uses 5-minute TTL; plan upgrades invalidate within 60 seconds via cache key deletion.

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. They are complementary:
- Unit tests catch concrete bugs in specific scenarios and edge cases
- Property tests verify universal correctness across all valid inputs

### Property-Based Testing

Library: **fast-check** (TypeScript-native, integrates with Vitest)

Each property test runs a minimum of **100 iterations**.

Tag format for each test:
```
// Feature: business-modules-core, Property N: <property_text>
```

### Unit Testing

Focus areas:
- Specific compression examples (whitespace, dedup, pruning)
- Routing score calculation with known inputs
- HMAC signature verification
- API route authentication and ownership checks
- Plan gating edge cases (exactly at limit, one over limit)
- Worker retry logic with mocked HTTP responses

### Test File Structure

```
tests/
├── unit/
│   ├── optimizer.test.ts
│   ├── router.test.ts
│   ├── adapters/
│   │   ├── openai.test.ts
│   │   ├── anthropic.test.ts
│   │   ├── mistral.test.ts
│   │   └── gemini.test.ts
│   ├── webhook-engine.test.ts
│   ├── analytics-worker.test.ts
│   └── usage-api.test.ts
└── integration/
    ├── gateway-pipeline.test.ts
    └── worker-queue.test.ts
```

### E2E Tests (Playwright)

- Analytics dashboard renders with data
- Webhook creation flow (secret shown once)
- Date range picker triggers refetch
- Plan gating: Free user sees upsell prompt


---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Optimizer Idempotence

*For any* valid `GatewayRequest`, applying the Context_Optimizer twice SHALL produce the same compressed request and `savedTokens=0` on the second application.

**Validates: Requirements 1.5, 1.12**

---

### Property 2: Optimizer Plan Gate Identity

*For any* `GatewayRequest` processed when `contextOptimizerEnabled=false`, the returned request SHALL be identical to the input and `savedTokens` SHALL equal 0.

**Validates: Requirements 1.7, 10.1**

---

### Property 3: OptimizationLog Creation

*For any* `GatewayRequest` processed by the Context_Optimizer (when enabled), an `OptimizationLog` record SHALL exist in the database containing the correct `originalTokens`, `optimizedTokens`, `savedTokens`, and `technique` values.

**Validates: Requirements 1.9**

---

### Property 4: Token Estimation Consistency

*For any* string input, the token estimation function SHALL return the same non-negative integer on repeated calls (determinism), and the estimate SHALL equal `Math.ceil(charCount / 4)` when the `cl100k_base` tokenizer is unavailable.

**Validates: Requirements 1.11**

---

### Property 5: Routing Score Formula Correctness

*For any* set of candidate models with known `inputCostPer1kTokens`, `avgLatencyMs`, and complexity classification, the computed `Routing_Score` SHALL equal `(costWeight * normalizedCost) + (latencyWeight * normalizedLatency) - (complexityMatch * 0.3)`, and the model with the lowest score SHALL be selected.

**Validates: Requirements 2.1**

---

### Property 6: Complexity Classification

*For any* `GatewayRequest`, the complexity classification SHALL be `low` when total message character count is below 500, `medium` when between 500 and 2000 inclusive, and `high` when above 2000.

**Validates: Requirements 2.2**

---

### Property 7: Router Filters by Active Provider Key

*For any* routing decision, the selected model's provider SHALL have an active `LLMProviderKey` record for the requesting user. No model from a provider without an active key SHALL ever be selected.

**Validates: Requirements 2.5**

---

### Property 8: Routed Flag Invariant

*For any* routing result, `routed` SHALL be `true` if and only if the selected model differs from the originally requested model.

**Validates: Requirements 2.6, 2.7**

---

### Property 9: Router Plan Gate Identity

*For any* `GatewayRequest` processed when `modelRouterEnabled=false`, the returned model SHALL be identical to `request.model` and `routed` SHALL be `false`.

**Validates: Requirements 2.8, 2.12, 10.2**

---

### Property 10: GatewayResponse Token Sum Invariant

*For any* `GatewayResponse` returned by any LLM_Adapter (non-streaming), `totalTokens` SHALL equal `promptTokens + completionTokens`.

**Validates: Requirements 3.3, 3.12, 12.5**

---

### Property 11: Adapter Error Retryability Classification

*For any* HTTP response from a provider, a status code ≥ 500 or a timeout SHALL produce a `ProviderError` with `retryable=true`, and a status code in the 4xx range (except 429) SHALL produce a `ProviderError` with `retryable=false`.

**Validates: Requirements 3.4, 3.5**

---

### Property 12: Gateway Retry Count

*For any* sequence of retryable `ProviderError` responses, the gateway SHALL make exactly `maxRetries + 1` total attempts before giving up (or fewer if a non-retryable error occurs).

**Validates: Requirements 3.10**

---

### Property 13: HMAC Signature Round-Trip

*For any* webhook payload and secret, computing the HMAC_Signature and then verifying it using the same secret SHALL return `true`. The signature format SHALL be `hmac-sha256=` followed by the lowercase hex-encoded HMAC-SHA256 digest.

**Validates: Requirements 4.4, 4.16**

---

### Property 14: Webhook Retry Exponential Backoff

*For any* sequence of 5xx delivery failures, the retry delays SHALL follow the sequence 1000ms, 2000ms, 4000ms, 8000ms, 16000ms (doubling each time), and the total number of attempts SHALL not exceed 6 (1 initial + 5 retries).

**Validates: Requirements 4.7**

---

### Property 15: No Retry on 4xx

*For any* webhook delivery that receives a 4xx response (excluding 429), exactly one delivery attempt SHALL be made and the delivery SHALL be marked as permanently failed without further retries.

**Validates: Requirements 4.8**

---

### Property 16: WebhookDelivery Record Per Attempt

*For any* webhook delivery attempt (success or failure), a `WebhookDelivery` record SHALL be created containing `webhookId`, `event`, `payload`, `status`, `responseMs`, `success`, and `retryCount`.

**Validates: Requirements 4.10**

---

### Property 17: failCount Increment and Auto-Disable

*For any* webhook that exhausts all retries on a delivery, `Webhook.failCount` SHALL be incremented by 1. When `failCount` exceeds 10, `Webhook.isActive` SHALL be set to `false`.

**Validates: Requirements 4.11**

---

### Property 18: Wildcard Event Subscription

*For any* event type in the supported event list, a `Webhook` with `events=["*"]` SHALL receive a delivery job for that event.

**Validates: Requirements 4.14**

---

### Property 19: Webhook List Never Exposes Secret

*For any* `GET /api/v1/webhooks` response, no item in the returned array SHALL contain a `secret` field.

**Validates: Requirements 5.3**

---

### Property 20: Delivery List Ordering and Limit

*For any* webhook with deliveries, `GET /api/v1/webhooks/[id]/deliveries` SHALL return at most 50 records ordered by `createdAt` descending (most recent first).

**Validates: Requirements 5.4**

---

### Property 21: UsageLog Creation Per Analytics Job

*For any* analytics job successfully processed by the Analytics_Worker, exactly one `UsageLog` record SHALL be created with all fields matching the job payload.

**Validates: Requirements 6.2**

---

### Property 22: DailyUsageCache Aggregation Consistency

*For any* set of analytics jobs processed for the same `(userId, date)`, the `DailyUsageCache.totalTokens` for that `(userId, date)` SHALL equal the sum of `UsageLog.totalTokens` for all records with the same `userId` and `createdAt` date.

**Validates: Requirements 6.3, 6.9**

---

### Property 23: Usage API Date Range Filtering

*For any* `GET /api/v1/usage?from=X&to=Y` request, all data in the response SHALL be sourced exclusively from records where `date >= X` and `date <= Y` (inclusive).

**Validates: Requirements 7.2**

---

### Property 24: Advanced Analytics Plan Gate

*For any* `GET /api/v1/usage` response for a user with `advancedAnalytics=false`, the response SHALL NOT contain `byModel`, `byProvider`, or trend data fields.

**Validates: Requirements 7.9, 10.3**

---

### Property 25: Usage API Breakdown Consistency

*For any* `GET /api/v1/usage` response that includes `byModel`, the sum of `byModel[i].totalTokens` SHALL equal `totalTokens`, and the sum of `byModel[i].totalCostUsd` SHALL equal `totalCostUsd`.

**Validates: Requirements 7.11, 7.12**

---

### Property 26: Plan Token Quota Enforcement

*For any* user on the Free plan whose monthly `totalTokens` reaches 50,000, `Plan_Guard` SHALL return `{ allowed: false }`. For Pro (2M) and Team (10M) plan users at their limit, `Plan_Guard` SHALL return `{ allowed: true, overage: true }`. For Enterprise users, `Plan_Guard` SHALL always return `{ allowed: true }`.

**Validates: Requirements 10.5, 10.6, 10.7, 10.8**

---

### Property 27: HTTPS URL Validation

*For any* webhook URL that does not begin with `https://`, the Webhook_Engine SHALL reject it before enqueuing a delivery job, and the Webhook_API SHALL return HTTP 400.

**Validates: Requirements 5.1, 12.1**

---

### Property 28: Analytics Non-Negative Validation

*For any* analytics job, the Analytics_Worker SHALL reject (log warning and correct) any job where `costUsd < 0` or `totalTokens < 0` before writing to the database.

**Validates: Requirements 12.4**

---

### Property 29: User Ownership Enforcement

*For any* request to the Usage_API with a `projectId` filter, or any request to the Webhook_API targeting a specific webhook, the system SHALL return HTTP 403 if the resource does not belong to the authenticated user.

**Validates: Requirements 12.6, 12.7**

---

### Property 30: Budget Progress Bar Color Threshold

*For any* `tokensPct` value, the budget progress bar SHALL render in the default color when `tokensPct < alertThresholdPct`, in amber/orange when `tokensPct >= alertThresholdPct` and `tokensPct < 100`, and in red when `tokensPct >= 100`.

**Validates: Requirements 8.3, 8.4**
