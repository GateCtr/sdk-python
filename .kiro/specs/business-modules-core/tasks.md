# Tasks — business-modules-core

## Task List

- [x] 1 Schema Migration
  - [x] 1.1 Add `deliveryId String @default(cuid())` field to `WebhookDelivery` model in `prisma/schema.prisma`
  - [x] 1.2 Add composite index `@@index([userId, provider, createdAt])` to `UsageLog` model in `prisma/schema.prisma`
  - [x] 1.3 Run `pnpm prisma migrate dev --name business-modules-core` to generate and apply the migration

- [x] 2 Context Optimizer (`lib/optimizer.ts`)
  - [x] 2.1 Replace the existing stub with the full `OptimizeResult` interface and `optimize()` function signature
  - [x] 2.2 Implement Stage 1: whitespace normalization (collapse ≥2 spaces/tabs, strip leading/trailing whitespace per message, normalize line endings)
  - [x] 2.3 Implement Stage 2: duplicate message deduplication (SHA-256 hash per message, remove exact duplicates keeping last occurrence, preserve role ordering)
  - [x] 2.4 Implement Stage 3: semantic pruning (remove filler phrases, strip repeated instruction fragments, load active `OptimizationRule` records with `ruleType="pruning"`)
  - [x] 2.5 Implement Stage 4: system prompt compression (apply stages 1–3 to system messages, truncate to 80% of original if still above threshold)
  - [x] 2.6 Implement token estimation: `Math.ceil(charCount / 4)` fallback; use `cl100k_base` via `tiktoken` when available
  - [x] 2.7 Implement plan gate: return original request with `savedTokens=0` when `contextOptimizerEnabled=false`
  - [x] 2.8 Write `OptimizationLog` record after each optimization (fire-and-forget, never throws)
  - [x] 2.9 Wrap entire `optimize()` in try/catch — on any exception, log error and return original request unchanged
  - [x] 2.10 Log `{ savedTokens, originalTokens, optimizedTokens, technique, durationMs }` at debug level

- [x] 3 Model Router (`lib/router.ts`)
  - [x] 3.1 Replace the existing stub with the full `RouteResult` interface and updated `route(request, userId)` signature
  - [x] 3.2 Implement complexity classification: `< 500` chars → `low`, `500–2000` → `medium`, `> 2000` → `high`
  - [x] 3.3 Fetch active `ModelCatalog` entries for providers where the user has an active `LLMProviderKey`; cache in Redis with 5-minute TTL
  - [x] 3.4 Implement min-max normalization of `inputCostPer1kTokens` and `avgLatencyMs` across candidate models
  - [x] 3.5 Implement scoring formula: `score = (0.6 * normalizedCost) + (0.4 * normalizedLatency) - (complexityMatch * 0.3)`
  - [x] 3.6 Select model with lowest score; return `{ model, routed: selectedModel !== request.model, scoringDurationMs }`
  - [x] 3.7 Implement plan gate: return `{ model: request.model, routed: false }` when `modelRouterEnabled=false`
  - [x] 3.8 Wrap entire `route()` in try/catch — on any exception, log error and return original model with `routed: false`
  - [x] 3.9 Log `{ requestedModel, selectedModel, routed, scoringDurationMs }` at debug level

- [x] 4 LLM Adapters (`lib/llm/`)
  - [x] 4.1 Define `LLMAdapter` interface in `lib/llm/types.ts` with `complete()` and `chat()` methods
  - [x] 4.2 Implement `lib/llm/openai.ts` adapter — native OpenAI format, reads `baseUrl`/`defaultTimeout` from `LLMProviderConfig` (Redis-cached)
  - [x] 4.3 Implement `lib/llm/anthropic.ts` adapter — translate `role: "system"` messages to `system` parameter, exclude from `messages[]`
  - [x] 4.4 Implement `lib/llm/mistral.ts` adapter — OpenAI-compatible format
  - [x] 4.5 Implement `lib/llm/gemini.ts` adapter — translate `role: "assistant"` → `"model"` in `contents[]`
  - [x] 4.6 All adapters: throw `ProviderError(retryable=true)` on HTTP 5xx or timeout; throw `ProviderError(retryable=false)` on HTTP 4xx
  - [x] 4.7 All adapters: when `stream=true`, return `GatewayResponse` with `stream` field and `promptTokens=completionTokens=totalTokens=0`
  - [x] 4.8 Implement gateway retry wrapper in `app/api/v1/chat/route.ts` and `app/api/v1/complete/route.ts`: retry up to `maxRetries` with `retryDelay * attemptNumber` ms delay on retryable errors
  - [x] 4.9 After all retries exhausted, attempt fallback provider if user has an active `LLMProviderKey` for a different provider; otherwise return 502

- [x] 5 Webhook Engine — BullMQ Refactor (`lib/webhooks.ts`)
  - [x] 5.1 Install/verify `bullmq` and `ioredis` dependencies in `package.json`
  - [x] 5.2 Create `lib/queues.ts` exporting `webhooksQueue` (BullMQ Queue, name `"webhooks"`) and `analyticsQueue` (BullMQ Queue, name `"analytics"`) connected via IORedis to `REDIS_URL`
  - [x] 5.3 Refactor `dispatchWebhook()` in `lib/webhooks.ts` to enqueue a BullMQ job into `webhooksQueue` instead of making synchronous HTTP calls; return immediately, never throw

- [x] 6 Webhook Worker (`workers/webhook.worker.ts`)
  - [x] 6.1 Create `workers/webhook.worker.ts` — BullMQ Worker on queue `"webhooks"`, concurrency 10, job timeout 30s
  - [x] 6.2 Implement job processor: fetch all active `Webhook` records for `userId` where `events` contains the event or `["*"]`
  - [x] 6.3 Build canonical payload: `{ event, project_id: userId, timestamp: ISO string, data }`
  - [x] 6.4 Compute HMAC signature: `hmac-sha256=` + hex(HMAC-SHA256(webhook.secret, JSON.stringify(payload)))
  - [x] 6.5 POST to webhook URL with headers: `X-GateCtr-Signature`, `X-GateCtr-Event`, `X-GateCtr-Delivery` (UUID v4), `Content-Type: application/json`; set 10s timeout, `redirect: "error"`
  - [x] 6.6 Implement retry logic: on 5xx/network error retry with delays 1s, 2s, 4s, 8s, 16s (max 5 retries); on 4xx (except 429) fail immediately; on 429 retry after `Retry-After` header
  - [x] 6.7 Truncate response body to 1MB + `[truncated]` if response body exceeds 1MB
  - [x] 6.8 Write `WebhookDelivery` record after each attempt (success or failure) with all required fields including `deliveryId`
  - [x] 6.9 On success: increment `Webhook.successCount`, update `Webhook.lastFiredAt`
  - [x] 6.10 On exhausted retries: increment `Webhook.failCount`; if `failCount > 10` set `Webhook.isActive = false`
  - [x] 6.11 On job failure after all retries: capture to Sentry with `{ webhookId, event, url, lastError }` context
  - [x] 6.12 Log `{ webhookId, event, deliveryId, statusCode, responseMs, attempt, success }` at info level per attempt
  - [x] 6.13 Configure job retention: `removeOnComplete: { count: 1000 }`, `removeOnFail: { count: 5000 }`

- [x] 7 Analytics Worker (`workers/analytics.worker.ts`)
  - [x] 7.1 Create `workers/analytics.worker.ts` — BullMQ Worker on queue `"analytics"`, concurrency 20
  - [x] 7.2 Validate job data: `costUsd >= 0`, `totalTokens >= 0`; validate `totalTokens == promptTokens + completionTokens` (log warning and correct to sum if mismatch)
  - [x] 7.3 Create `UsageLog` record from job payload
  - [x] 7.4 Upsert `DailyUsageCache` on `(userId, projectId, date)` — increment `totalTokens`, `totalRequests`, `totalCostUsd`, `savedTokens`
  - [x] 7.5 Call `recordBudgetUsage(userId, projectId, totalTokens, costUsd)` after upsert
  - [x] 7.6 Configure retry: 3 attempts with 2s delay; on exhaustion capture to Sentry with `{ userId, totalTokens, model }` context
  - [x] 7.7 Log `{ jobId, userId, totalTokens, costUsd, processingMs }` at debug level per processed job
  - [x] 7.8 Configure job retention: `removeOnComplete: { count: 5000 }`, `removeOnFail: { count: 10000 }`

- [x] 8 Analytics Queue Integration in Gateway
  - [x] 8.1 In `app/api/v1/chat/route.ts` and `app/api/v1/complete/route.ts`, after a successful LLM response, enqueue an analytics job into `analyticsQueue` with all required fields
  - [x] 8.2 Implement Redis availability check: if `analyticsQueue.add()` throws, fall back to direct synchronous `UsageLog` creation and log a warning

- [x] 9 Worker Entry Point & Infrastructure
  - [x] 9.1 Create `workers/index.ts` — imports and starts both `webhookWorker` and `analyticsWorker`
  - [x] 9.2 Register `SIGTERM` and `SIGINT` handlers: call `worker.close()` on both workers, then `process.exit(0)`
  - [x] 9.3 Configure IORedis reconnection strategy: exponential backoff, up to 10 retries before exiting
  - [x] 9.4 Add `"workers": "tsx workers/index.ts"` script to `package.json`

- [x] 10 Webhook Management API
  - [x] 10.1 Extend `POST /api/v1/webhooks` (`app/api/v1/webhooks/route.ts`): validate `url` is HTTPS, validate `name` is present, generate `whsec_` prefixed secret, enforce `maxWebhooks` quota (return 429 on exceeded)
  - [x] 10.2 Add `GET /api/v1/webhooks` handler: return all user webhooks with fields `{ id, name, url, events, isActive, lastFiredAt, failCount, successCount, createdAt }` — omit `secret`
  - [x] 10.3 Create `app/api/v1/webhooks/[id]/route.ts` with `PATCH` (update name/url/events/headers/isActive, enforce ownership → 403) and `DELETE` (set `isActive=false`, enforce ownership → 403)
  - [x] 10.4 Create `app/api/v1/webhooks/[id]/deliveries/route.ts` with `GET`: return 50 most recent `WebhookDelivery` records ordered by `createdAt` desc, enforce ownership
  - [x] 10.5 Create `app/api/v1/webhooks/[id]/test/route.ts` with `POST`: enqueue test job with event `webhook.test` and payload `{ message: "Test delivery from GateCtr" }`

- [x] 11 Usage API Extensions (`app/api/v1/usage/route.ts`)
  - [x] 11.1 Add `byProvider` array to `GET /api/v1/usage` response: group `UsageLog` by `provider` for the date range, return `{ provider, totalTokens, totalRequests, totalCostUsd }`
  - [x] 11.2 Add `provider` field to each `byModel` entry (join from `UsageLog` groupBy `[model, provider]`)
  - [x] 11.3 Add `savedTokens` field to each `byModel` entry (sum from `UsageLog`)
  - [x] 11.4 Implement plan gate: when `advancedAnalytics=false`, omit `byModel`, `byProvider` from response
  - [x] 11.5 Create `app/api/v1/usage/trends/route.ts`: query `DailyUsageCache` grouped by `date` for the requested range; return `{ trends: [{ date, totalTokens, totalRequests, totalCostUsd, savedTokens }] }`; gate on `advancedAnalytics` (return 403 with `{ error: "plan_required" }` for Free users)

- [x] 12 Analytics Dashboard (`app/[locale]/(dashboard)/analytics/`)
  - [x] 12.1 Create `components/dashboard/analytics/stat-card.tsx` — displays a single metric (label + value + optional delta)
  - [x] 12.2 Create `components/dashboard/analytics/budget-progress-bar.tsx` — renders progress bar; default color below threshold, amber at/above `alertThresholdPct`, red at 100%; displays "Budget limit reached" message at 100%
  - [x] 12.3 Create `components/dashboard/analytics/date-range-picker.tsx` — presets: "Last 7 days", "Last 30 days", "This month", "Last month"; triggers callback on change
  - [x] 12.4 Create `components/dashboard/analytics/token-trend-chart.tsx` — Recharts `LineChart` of daily `totalTokens` for the selected date range; Pro+ only
  - [x] 12.5 Create `components/dashboard/analytics/model-breakdown-table.tsx` — TanStack Table with columns: model, provider, totalTokens, totalRequests, totalCostUsd (formatted `$0.0000`), savedTokens; Pro+ only
  - [x] 12.6 Create `components/dashboard/analytics/upsell-prompt.tsx` — shown to Free users in place of Pro components; links to billing page
  - [x] 12.7 Create `components/dashboard/analytics/analytics-dashboard.tsx` — client component; Zustand store for date range state; TanStack Query for data fetching; composes all sub-components; shows empty state "No usage yet. Make your first API call to see data here." when no data
  - [x] 12.8 Update `app/[locale]/(dashboard)/analytics/page.tsx` — server component fetching initial data; renders `AnalyticsDashboard`
  - [x] 12.9 Create `messages/en/analytics.json` with all analytics page translations
  - [x] 12.10 Create `messages/fr/analytics.json` with French translations
  - [x] 12.11 Update `i18n/request.ts` to import `analytics` translation namespace

- [x] 13 Webhook Dashboard (`app/[locale]/(dashboard)/webhooks/`)
  - [x] 13.1 Create `components/dashboard/webhooks/quota-badge.tsx` — displays "N of M webhooks used"
  - [x] 13.2 Create `components/dashboard/webhooks/create-webhook-form.tsx` — fields: name (required), url (required, HTTPS validated), events (multi-select from supported event types); on success shows `SecretReveal`
  - [x] 13.3 Create `components/dashboard/webhooks/secret-reveal.tsx` — shows secret once with copy button and warning "Store this secret securely. It will not be shown again."
  - [x] 13.4 Create `components/dashboard/webhooks/webhook-row.tsx` — displays name, url, events, isActive toggle, lastFiredAt, successCount, failCount; shows warning badge when `failCount > 5`; includes delivery history (last 10) and "Send test" button
  - [x] 13.5 Create `components/dashboard/webhooks/webhooks-dashboard.tsx` — client component; TanStack Query for data; composes all sub-components; empty state
  - [x] 13.6 Update `app/[locale]/(dashboard)/webhooks/page.tsx` to render `WebhooksDashboard`
  - [x] 13.7 Create `messages/en/webhooks.json` with all webhook dashboard translations
  - [x] 13.8 Create `messages/fr/webhooks.json` with French translations
  - [x] 13.9 Update `i18n/request.ts` to import `webhooks` translation namespace

- [x] 14 Property-Based Tests (`tests/unit/`)
  - [x] 14.1 Write property test for Property 1 (Optimizer Idempotence): for any GatewayRequest, `optimize(optimize(r).request).savedTokens === 0`
    - Feature: business-modules-core, Property 1: Optimizer Idempotence
  - [x] 14.2 Write property test for Property 2 (Optimizer Plan Gate Identity): for any GatewayRequest with gate disabled, result equals input with savedTokens=0
    - Feature: business-modules-core, Property 2: Optimizer Plan Gate Identity
  - [x] 14.3 Write property test for Property 4 (Token Estimation Consistency): for any string, `estimateTokens(s) === estimateTokens(s)` and equals `Math.ceil(s.length / 4)`
    - Feature: business-modules-core, Property 4: Token Estimation Consistency
  - [x] 14.4 Write property test for Property 5 (Routing Score Formula): for any model candidates with known values, computed score matches formula
    - Feature: business-modules-core, Property 5: Routing Score Formula Correctness
  - [x] 14.5 Write property test for Property 6 (Complexity Classification): for any character count, classification matches the three thresholds
    - Feature: business-modules-core, Property 6: Complexity Classification
  - [x] 14.6 Write property test for Property 8 (Routed Flag Invariant): for any routing result, `routed === (selectedModel !== requestedModel)`
    - Feature: business-modules-core, Property 8: Routed Flag Invariant
  - [x] 14.7 Write property test for Property 9 (Router Plan Gate Identity): for any request with gate disabled, returns original model with routed=false
    - Feature: business-modules-core, Property 9: Router Plan Gate Identity
  - [x] 14.8 Write property test for Property 10 (Token Sum Invariant): for any GatewayResponse (non-streaming), `totalTokens === promptTokens + completionTokens`
    - Feature: business-modules-core, Property 10: GatewayResponse Token Sum Invariant
  - [x] 14.9 Write property test for Property 11 (Error Retryability): for any HTTP status ≥ 500, `retryable=true`; for 4xx (not 429), `retryable=false`
    - Feature: business-modules-core, Property 11: Adapter Error Retryability Classification
  - [x] 14.10 Write property test for Property 13 (HMAC Round-Trip): for any payload and secret, `verify(sign(payload, secret), secret) === true`
    - Feature: business-modules-core, Property 13: HMAC Signature Round-Trip
  - [x] 14.11 Write property test for Property 14 (Exponential Backoff): for any sequence of 5xx failures, retry delays equal [1000, 2000, 4000, 8000, 16000]ms
    - Feature: business-modules-core, Property 14: Webhook Retry Exponential Backoff
  - [x] 14.12 Write property test for Property 15 (No Retry on 4xx): for any 4xx response (not 429), exactly 1 delivery attempt is made
    - Feature: business-modules-core, Property 15: No Retry on 4xx
  - [x] 14.13 Write property test for Property 19 (Webhook List No Secret): for any GET /api/v1/webhooks response, no item contains a `secret` field
    - Feature: business-modules-core, Property 19: Webhook List Never Exposes Secret
  - [x] 14.14 Write property test for Property 22 (DailyUsageCache Aggregation Consistency): for any set of analytics jobs for same (userId, date), cache total equals sum of UsageLogs
    - Feature: business-modules-core, Property 22: DailyUsageCache Aggregation Consistency
  - [x] 14.15 Write property test for Property 24 (Advanced Analytics Plan Gate): for any Free plan user response, `byModel` and `byProvider` fields are absent
    - Feature: business-modules-core, Property 24: Advanced Analytics Plan Gate
  - [x] 14.16 Write property test for Property 25 (Breakdown Consistency): for any usage response with byModel, `sum(byModel[].totalTokens) === totalTokens` and `sum(byModel[].totalCostUsd) === totalCostUsd`
    - Feature: business-modules-core, Property 25: Usage API Breakdown Consistency
  - [x] 14.17 Write property test for Property 26 (Plan Quota Enforcement): for each plan type at its token limit, Plan_Guard returns the correct `{ allowed, overage }` shape
    - Feature: business-modules-core, Property 26: Plan Token Quota Enforcement
  - [x] 14.18 Write property test for Property 27 (HTTPS URL Validation): for any non-HTTPS URL, webhook creation is rejected with 400
    - Feature: business-modules-core, Property 27: HTTPS URL Validation
  - [x] 14.19 Write property test for Property 28 (Non-Negative Validation): for any analytics job with negative costUsd or totalTokens, the worker corrects/rejects before DB write
    - Feature: business-modules-core, Property 28: Analytics Non-Negative Validation
  - [x] 14.20 Write property test for Property 29 (Ownership Enforcement): for any request with a projectId or webhookId not owned by the user, response is 403
    - Feature: business-modules-core, Property 29: User Ownership Enforcement
  - [x] 14.21 Write property test for Property 30 (Budget Bar Color): for any tokensPct value, the correct color variant is returned by the progress bar component
    - Feature: business-modules-core, Property 30: Budget Progress Bar Color Threshold

- [x] 15 Unit Tests (`tests/unit/`)
  - [x] 15.1 Write unit tests for optimizer: whitespace normalization example, deduplication example, pruning example, system prompt compression example
  - [x] 15.2 Write unit tests for router: known score calculation, complexity classification boundaries (499, 500, 2000, 2001 chars)
  - [x] 15.3 Write unit tests for Anthropic adapter: system message translation, role mapping
  - [x] 15.4 Write unit tests for Gemini adapter: assistant→model role translation
  - [x] 15.5 Write unit tests for webhook worker: HMAC signature format verification, 429 Retry-After handling, failCount > 10 auto-disable
  - [x] 15.6 Write unit tests for analytics worker: token mismatch correction (log warning + use sum), Redis fallback to synchronous write
  - [x] 15.7 Write unit tests for usage API: default date range (current month), projectId ownership check (403 for unowned), budgetStatus inclusion when Budget exists
  - [x] 15.8 Write unit tests for plan gating: Free at exactly 50K tokens (blocked), Pro at exactly 2M (overage), Enterprise (always allowed)
