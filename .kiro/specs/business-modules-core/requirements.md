# Requirements Document

## Introduction

This feature implements the five core business modules of GateCtr that transform it from a basic API proxy into a production-grade LLM middleware platform. The modules are: Context Optimizer (automatic prompt compression), Model Router & LLM Adapters (intelligent model selection with full provider coverage), Webhook Engine (BullMQ-backed async event dispatcher), Analytics Queue (usage ingestion pipeline), and Usage & Consumption Analytics (dashboard-level reporting). All modules integrate with the existing infrastructure: Prisma/PostgreSQL, Upstash Redis, BullMQ/IORedis, Clerk auth, and Stripe billing. Plan gating follows the established hierarchy: Free (50K tokens/month), Pro (2M), Team (10M), Enterprise (unlimited).

---

## Glossary

- **Context_Optimizer**: The GateCtr module that compresses prompt messages before forwarding to an LLM provider, reducing token usage without degrading output quality.
- **Compression_Pipeline**: The ordered sequence of techniques applied by the Context_Optimizer: whitespace normalization → deduplication → semantic pruning → system prompt compression.
- **Model_Router**: The GateCtr module that selects the optimal LLM model for a given request based on a scoring function that weighs estimated complexity, cost per token, and average latency.
- **Routing_Score**: A numeric value computed per candidate model by the Model_Router, combining cost weight, latency weight, and complexity match.
- **LLM_Adapter**: A provider-specific translation layer (OpenAI, Anthropic, Mistral, Gemini) that converts a `GatewayRequest` to the provider's wire format and maps the response back to `GatewayResponse`.
- **GatewayRequest**: The normalized internal request object passed through the gateway pipeline, defined in `lib/llm/types.ts`.
- **GatewayResponse**: The normalized internal response object returned by every LLM_Adapter, containing `promptTokens`, `completionTokens`, `totalTokens`, `content`, `latencyMs`, and optional `stream`.
- **Webhook_Engine**: The GateCtr module that enqueues webhook delivery jobs into BullMQ and processes them asynchronously via a worker.
- **Webhook_Worker**: The BullMQ worker process (`workers/webhook.worker.ts`) that dequeues jobs, signs payloads with HMAC-SHA256, delivers them to target URLs, and records results.
- **Webhook_Job**: A BullMQ job containing the webhook ID, event name, payload, and delivery metadata.
- **HMAC_Signature**: The `X-GateCtr-Signature` header value computed as `hmac-sha256=HMAC-SHA256(webhookSecret, canonicalPayload)`.
- **Analytics_Queue**: The BullMQ queue (`analytics`) that receives usage ingestion jobs after each completed LLM request, decoupling the hot path from DB writes.
- **Analytics_Worker**: The BullMQ worker (`workers/analytics.worker.ts`) that dequeues analytics jobs and upserts `UsageLog` and `DailyUsageCache` records.
- **UsageLog**: The Prisma model recording per-request token usage, cost, latency, model, provider, and optimization flags.
- **DailyUsageCache**: The Prisma model storing pre-aggregated daily totals per user/project, used as the primary source for analytics queries.
- **Usage_API**: The `/api/v1/usage` endpoint that returns aggregated analytics from `DailyUsageCache`.
- **Analytics_Dashboard**: The dashboard pages under `app/[locale]/(dashboard)/` that display token usage, cost breakdown, model distribution, and trends.
- **Plan_Guard**: The existing `lib/plan-guard.ts` module that enforces per-plan quotas and feature gates.
- **Saved_Tokens**: The number of tokens eliminated by the Context_Optimizer for a given request, recorded in `UsageLog.savedTokens`.
- **Optimization_Log**: The Prisma model recording which compression techniques were applied and how many tokens each saved.
- **Provider**: One of `openai`, `anthropic`, `mistral`, `gemini` — the upstream LLM service.
- **Fallback_Provider**: An alternative Provider used when the primary Provider fails all retries.

---

## Requirements

### Requirement 1: Context Optimizer — Prompt Compression

**User Story:** As a developer using GateCtr on a Pro or higher plan, I want my prompts automatically compressed before they reach the LLM provider, so that I pay fewer tokens without changing my application code.

#### Acceptance Criteria

1. THE Context_Optimizer SHALL implement a Compression_Pipeline with four ordered techniques: whitespace normalization, duplicate message deduplication, semantic pruning of low-information content, and system prompt compression.
2. WHEN the Context_Optimizer processes a GatewayRequest, THE Context_Optimizer SHALL return a modified GatewayRequest and a `savedTokens` integer representing the number of tokens eliminated.
3. WHEN the Context_Optimizer processes a GatewayRequest, THE Context_Optimizer SHALL preserve the semantic intent of all messages such that the compressed prompt produces equivalent LLM output for factual and instruction-following tasks.
4. WHEN the Context_Optimizer processes a GatewayRequest with no compressible content, THE Context_Optimizer SHALL return the original GatewayRequest unchanged with `savedTokens` equal to 0.
5. WHEN the Context_Optimizer is applied to a GatewayRequest that has already been compressed, THE Context_Optimizer SHALL return `savedTokens` equal to 0 (idempotence).
6. THE Context_Optimizer SHALL target a token reduction of at least 40% on typical verbose prompts containing redundant whitespace, repeated instructions, or filler content, consistent with the platform's advertised "-40% tokens" value proposition. A minimum floor of 30% reduction is acceptable on prompts with limited compressible content.
7. WHERE the `contextOptimizerEnabled` flag is `false` in `PlanLimit`, THE Context_Optimizer SHALL NOT be invoked and the GatewayRequest SHALL be forwarded unchanged.
8. WHEN the Context_Optimizer is invoked, THE Context_Optimizer SHALL complete processing within 50ms for prompts up to 8,000 tokens.
9. WHEN the Context_Optimizer processes a GatewayRequest, THE Context_Optimizer SHALL create an Optimization_Log record containing the technique applied, `originalTokens`, `optimizedTokens`, and `savedTokens`.
10. IF the Context_Optimizer throws an unhandled exception, THEN THE Gateway SHALL log the error, skip optimization, and forward the original GatewayRequest unchanged.
11. THE Context_Optimizer SHALL estimate token counts using a character-based approximation (4 characters ≈ 1 token) when a tokenizer is not available, and SHALL use the `cl100k_base` tokenizer when available.
12. FOR ALL valid GatewayRequests, applying the Context_Optimizer twice SHALL produce the same result as applying it once (idempotence property).

---

### Requirement 2: Model Router — Intelligent Model Selection

**User Story:** As a developer using GateCtr on a Pro or higher plan, I want the gateway to automatically select the most cost-effective model capable of handling my request, so that I minimize cost without manually managing model selection.

#### Acceptance Criteria

1. THE Model_Router SHALL compute a Routing_Score for each active model in `ModelCatalog` using the formula: `score = (costWeight * normalizedCost) + (latencyWeight * normalizedLatency) - (complexityMatch * 0.3)`, where lower score is better.
2. WHEN the Model_Router evaluates a GatewayRequest, THE Model_Router SHALL estimate request complexity as `low`, `medium`, or `high` based on total message character count: below 500 characters is `low`, 500–2000 is `medium`, above 2000 is `high`.
3. WHEN request complexity is `low`, THE Model_Router SHALL prefer models with `inputCostPer1kTokens` below $0.01 and `avgLatencyMs` below 1000ms.
4. WHEN request complexity is `high`, THE Model_Router SHALL prefer models with `contextWindow` above 32,000 tokens and `inputCostPer1kTokens` below $0.05.
5. WHEN the Model_Router selects a model, THE Model_Router SHALL only select models where the user has an active `LLMProviderKey` for the model's provider.
6. WHEN the Model_Router selects a model different from the requested model, THE Model_Router SHALL return `{ model: selectedModelId, routed: true }`.
7. WHEN the Model_Router cannot find a better model than the requested model, THE Model_Router SHALL return `{ model: requestedModelId, routed: false }`.
8. WHERE the `modelRouterEnabled` flag is `false` in `PlanLimit`, THE Model_Router SHALL NOT be invoked and the original model SHALL be used unchanged.
9. WHEN the Model_Router is invoked, THE Model_Router SHALL complete scoring within 20ms.
10. IF the Model_Router throws an unhandled exception, THEN THE Gateway SHALL log the error, skip routing, and use the originally requested model.
11. THE Model_Router SHALL record the routing decision in `UsageLog.routed` as `true` when a different model was selected, and `false` otherwise.
12. FOR ALL GatewayRequests where `modelRouterEnabled` is `false`, THE Model_Router SHALL return the original model unchanged (identity property).

---

### Requirement 3: LLM Adapters — Provider Integration Layer

**User Story:** As a developer, I want GateCtr to support OpenAI, Anthropic, Mistral, and Gemini through a unified interface, so that I can switch providers without changing my application code.

#### Acceptance Criteria

1. THE LLM_Adapter for each Provider SHALL implement `complete(params: GatewayRequest, apiKey: string): Promise<GatewayResponse>` and `chat(params: GatewayRequest, apiKey: string): Promise<GatewayResponse>`.
2. WHEN an LLM_Adapter receives a GatewayRequest, THE LLM_Adapter SHALL read `baseUrl` and `defaultTimeout` from `LLMProviderConfig` in the database and SHALL NOT use hardcoded endpoint URLs.
3. WHEN an LLM_Adapter receives a response from a Provider, THE LLM_Adapter SHALL return a GatewayResponse where `totalTokens == promptTokens + completionTokens`.
4. WHEN a Provider returns an HTTP 5xx response or the request times out, THE LLM_Adapter SHALL throw a `ProviderError` with `retryable: true`.
5. WHEN a Provider returns an HTTP 4xx response, THE LLM_Adapter SHALL throw a `ProviderError` with `retryable: false`.
6. WHEN `GatewayRequest.stream` is `true`, THE LLM_Adapter SHALL return a GatewayResponse with a `stream` field containing the provider's `ReadableStream` and SHALL set `promptTokens`, `completionTokens`, and `totalTokens` to 0.
7. THE Anthropic LLM_Adapter SHALL translate `role: "system"` messages from the `messages` array into Anthropic's `system` parameter and SHALL exclude them from the `messages` array sent to the API.
8. THE Gemini LLM_Adapter SHALL translate `role: "assistant"` to `"model"` in the `contents` array sent to the Gemini API.
9. WHEN a Provider request times out per `LLMProviderConfig.defaultTimeout`, THE LLM_Adapter SHALL throw a `ProviderError` with `status: 408` and `retryable: true`.
10. THE Gateway SHALL retry failed LLM_Adapter calls up to `LLMProviderConfig.maxRetries` times with a delay of `retryDelay * attemptNumber` milliseconds between attempts.
11. WHEN all retries are exhausted and a Fallback_Provider key exists for the user, THE Gateway SHALL attempt the request using the Fallback_Provider's LLM_Adapter.
12. FOR ALL GatewayResponse objects returned by any LLM_Adapter, `totalTokens` SHALL equal `promptTokens + completionTokens` (token sum invariant).

---

### Requirement 4: Webhook Engine — BullMQ Async Dispatcher

**User Story:** As a developer, I want webhook events dispatched asynchronously with guaranteed delivery, HMAC signatures, and retry logic, so that my integrations (Slack, Teams, Discord, custom URLs) receive reliable event notifications without impacting gateway latency.

#### Acceptance Criteria

1. THE Webhook_Engine SHALL enqueue a Webhook_Job into the BullMQ `webhooks` queue for every call to `dispatchWebhook(userId, event, data)`, instead of making synchronous HTTP calls.
2. WHEN `dispatchWebhook` is called, THE Webhook_Engine SHALL return immediately after enqueuing and SHALL NOT await delivery.
3. THE Webhook_Worker SHALL process Webhook_Jobs by fetching all active `Webhook` records for the user that subscribe to the event.
4. WHEN the Webhook_Worker delivers a payload, THE Webhook_Worker SHALL compute the HMAC_Signature as `hmac-sha256=` followed by the hex-encoded HMAC-SHA256 of the JSON-serialized payload using the webhook's `secret` field.
5. WHEN the Webhook_Worker delivers a payload, THE Webhook_Worker SHALL include the HMAC_Signature in the `X-GateCtr-Signature` request header.
6. WHEN the Webhook_Worker delivers a payload, THE Webhook_Worker SHALL include `X-GateCtr-Event`, `X-GateCtr-Delivery` (a unique delivery UUID), and `Content-Type: application/json` headers.
7. WHEN a delivery attempt fails with an HTTP 5xx response or a network error, THE Webhook_Worker SHALL retry the delivery up to 5 times using exponential backoff: delays of 1s, 2s, 4s, 8s, 16s.
8. WHEN a delivery attempt fails with an HTTP 4xx response (except 429), THE Webhook_Worker SHALL NOT retry and SHALL mark the delivery as permanently failed.
9. WHEN a delivery attempt fails with HTTP 429, THE Webhook_Worker SHALL retry after the duration specified in the `Retry-After` response header, up to the maximum retry count.
10. AFTER each delivery attempt (success or failure), THE Webhook_Worker SHALL create a `WebhookDelivery` record with `webhookId`, `event`, `payload`, `status`, `responseMs`, `success`, `retryCount`, and `error`.
11. WHEN all retries are exhausted without success, THE Webhook_Worker SHALL increment `Webhook.failCount` and SHALL set `Webhook.isActive` to `false` if `failCount` exceeds 10 consecutive failures.
12. WHEN a delivery succeeds, THE Webhook_Worker SHALL increment `Webhook.successCount` and update `Webhook.lastFiredAt`.
13. THE Webhook_Engine SHALL support the following event types: `request.completed`, `request.blocked`, `budget.threshold`, `budget.exceeded`, `usage.threshold`, `api_key.created`, `api_key.revoked`.
14. WHEN a `Webhook` record has `events` set to `["*"]`, THE Webhook_Worker SHALL deliver all event types to that endpoint.
15. THE Webhook_Worker SHALL process jobs with a concurrency of 10 and a job timeout of 30 seconds per delivery attempt.
16. FOR ALL delivered payloads, verifying the HMAC_Signature using the webhook secret SHALL return `true` (signature round-trip property).

---

### Requirement 5: Webhook Management API

**User Story:** As a developer, I want to create, list, update, and delete webhooks via the API, so that I can manage my integrations programmatically.

#### Acceptance Criteria

1. THE Webhook_API `POST /api/v1/webhooks` SHALL accept `{ name, url, events, headers? }`, validate that `url` is a valid HTTPS URL, generate a `whsec_` prefixed secret, and create a `Webhook` record.
2. WHEN `POST /api/v1/webhooks` is called and the user has reached their plan's `maxWebhooks` limit, THE Webhook_API SHALL return HTTP 429 with `{ error: "quota_exceeded" }`.
3. THE Webhook_API `GET /api/v1/webhooks` SHALL return all webhooks for the authenticated user with fields `{ id, name, url, events, isActive, lastFiredAt, failCount, successCount, createdAt }` and SHALL NOT include the `secret` field.
4. THE Webhook_API `GET /api/v1/webhooks/[id]/deliveries` SHALL return the 50 most recent `WebhookDelivery` records for the specified webhook, ordered by `createdAt` descending.
5. THE Webhook_API `PATCH /api/v1/webhooks/[id]` SHALL allow updating `name`, `url`, `events`, `headers`, and `isActive`.
6. THE Webhook_API `DELETE /api/v1/webhooks/[id]` SHALL set `isActive = false` and SHALL NOT delete the record or its delivery history.
7. THE Webhook_API `POST /api/v1/webhooks/[id]/test` SHALL enqueue a test Webhook_Job with event `webhook.test` and payload `{ message: "Test delivery from GateCtr" }`.
8. IF a webhook `url` is not reachable during a test delivery, THEN THE Webhook_API SHALL return the delivery result including `success: false` and the error message.

---

### Requirement 6: Analytics Queue — Async Usage Ingestion

**User Story:** As a platform operator, I want usage data written asynchronously via a queue so that LLM request latency is not impacted by database writes, and so that usage records are reliably persisted even under high load.

#### Acceptance Criteria

1. WHEN an LLM request completes successfully, THE Gateway SHALL enqueue an analytics job into the BullMQ `analytics` queue containing `{ userId, projectId, apiKeyId, model, provider, promptTokens, completionTokens, totalTokens, savedTokens, costUsd, latencyMs, statusCode, optimized, routed, fallback, ipAddress }`.
2. THE Analytics_Worker SHALL dequeue analytics jobs and create a `UsageLog` record for each job.
3. THE Analytics_Worker SHALL upsert a `DailyUsageCache` record on `(userId, projectId, date)`, incrementing `totalTokens`, `totalRequests`, `totalCostUsd`, and `savedTokens`.
4. WHEN an analytics job fails to process, THE Analytics_Worker SHALL retry up to 3 times with a 2-second delay between attempts before marking the job as failed.
5. THE Analytics_Worker SHALL process jobs with a concurrency of 20.
6. WHEN a `UsageLog` record is created, THE Analytics_Worker SHALL also re-evaluate budget threshold alerts by calling `recordBudgetUsage`.
7. THE Analytics_Queue SHALL use a separate BullMQ queue named `analytics` distinct from the `webhooks` queue.
8. WHEN the BullMQ connection to Redis is unavailable, THE Gateway SHALL fall back to direct synchronous `UsageLog` creation and SHALL log a warning.
9. FOR ALL analytics jobs processed, the sum of `DailyUsageCache.totalTokens` for a given `(userId, date)` SHALL equal the sum of `UsageLog.totalTokens` for the same `(userId, createdAt date)` (aggregation consistency property).

---

### Requirement 7: Usage & Consumption Analytics API

**User Story:** As a developer, I want a rich analytics API that returns token usage, cost breakdown, model distribution, and trends, so that I can monitor my LLM spending and optimize my usage.

#### Acceptance Criteria

1. THE Usage_API `GET /api/v1/usage` SHALL return `{ totalTokens, totalRequests, totalCostUsd, savedTokens, from, to, byModel, byProject, byProvider, budgetStatus? }` aggregated from `DailyUsageCache`.
2. WHEN `?from=YYYY-MM-DD&to=YYYY-MM-DD` query parameters are provided, THE Usage_API SHALL filter results to the specified date range inclusive.
3. WHEN no date range is provided, THE Usage_API SHALL default to the current calendar month.
4. WHEN `?projectId=` is provided, THE Usage_API SHALL filter results to that project and SHALL return HTTP 403 if the project does not belong to the authenticated user.
5. THE Usage_API SHALL include a `byModel` array where each entry contains `{ model, provider, totalTokens, totalRequests, totalCostUsd, savedTokens }`.
6. THE Usage_API SHALL include a `byProvider` array where each entry contains `{ provider, totalTokens, totalRequests, totalCostUsd }`.
7. WHEN a `Budget` record exists for the user, THE Usage_API SHALL include a `budgetStatus` object containing `{ maxTokensPerMonth, maxCostPerMonth, tokensUsed, costUsed, tokensPct, alertThresholdPct, hardStop }`.
8. THE Usage_API `GET /api/v1/usage/trends` SHALL return daily aggregated data points for the requested date range, each containing `{ date, totalTokens, totalRequests, totalCostUsd, savedTokens }`.
9. WHERE `advancedAnalytics` is `false` in `PlanLimit`, THE Usage_API SHALL return only `totalTokens`, `totalRequests`, `totalCostUsd`, and `budgetStatus`, and SHALL omit `byModel`, `byProvider`, and trends data.
10. THE Usage_API SHALL authenticate via Clerk session or API key with `"read"` scope.
11. FOR ALL Usage_API responses, the sum of `byModel[].totalTokens` SHALL equal `totalTokens` (breakdown consistency invariant).
12. FOR ALL Usage_API responses, the sum of `byModel[].totalCostUsd` SHALL equal `totalCostUsd` (cost breakdown consistency invariant).

---

### Requirement 8: Usage & Consumption Analytics Dashboard

**User Story:** As a developer, I want a dashboard page that visualizes my token usage, cost breakdown, model distribution, and trends over time, so that I can understand my LLM spending at a glance.

#### Acceptance Criteria

1. THE Analytics_Dashboard SHALL display a summary row with `totalTokens`, `totalRequests`, `totalCostUsd`, and `savedTokens` for the current calendar month.
2. THE Analytics_Dashboard SHALL display a budget progress bar showing `tokensUsed / maxTokensPerMonth` as a percentage when a budget is configured.
3. WHEN `tokensPct` exceeds `alertThresholdPct`, THE Analytics_Dashboard SHALL render the budget progress bar in a warning color (amber/orange).
4. WHEN `tokensPct` reaches 100%, THE Analytics_Dashboard SHALL render the budget progress bar in an error color (red) and display a "Budget limit reached" message.
5. THE Analytics_Dashboard SHALL display a line chart of daily token usage for the last 30 days using Recharts.
6. THE Analytics_Dashboard SHALL display a breakdown table of usage by model, showing `model`, `provider`, `totalTokens`, `totalRequests`, `totalCostUsd`, and `savedTokens`.
7. WHERE `advancedAnalytics` is `false` in `PlanLimit`, THE Analytics_Dashboard SHALL display an upsell prompt for Pro plan in place of the model breakdown table and trend chart.
8. THE Analytics_Dashboard SHALL support date range selection with presets: "Last 7 days", "Last 30 days", "This month", "Last month".
9. WHEN the date range changes, THE Analytics_Dashboard SHALL refetch data from the Usage_API without a full page reload.
10. THE Analytics_Dashboard SHALL be accessible at `/dashboard/analytics` (English) and `/fr/dashboard/analytics` (French).
11. THE Analytics_Dashboard SHALL display all monetary values in USD with 4 decimal places (e.g., `$0.0042`).
12. WHEN no usage data exists for the selected period, THE Analytics_Dashboard SHALL display an empty state: "No usage yet. Make your first API call to see data here."

---

### Requirement 9: Webhook Dashboard UI

**User Story:** As a developer, I want a dashboard page to manage my webhooks, view delivery history, and test endpoints, so that I can configure and debug my integrations without using the API directly.

#### Acceptance Criteria

1. THE Webhook_Dashboard SHALL be accessible at `/dashboard/webhooks` (English) and `/fr/dashboard/webhooks` (French).
2. THE Webhook_Dashboard SHALL display a list of all webhooks with `name`, `url`, `events`, `isActive`, `lastFiredAt`, `successCount`, and `failCount`.
3. THE Webhook_Dashboard SHALL provide a form to create a new webhook with fields: `name` (required), `url` (required, HTTPS), `events` (multi-select from supported event types).
4. THE Webhook_Dashboard SHALL display the webhook `secret` only once at creation time, with a copy button and a warning: "Store this secret securely. It will not be shown again."
5. THE Webhook_Dashboard SHALL allow toggling `isActive` per webhook via a switch control.
6. THE Webhook_Dashboard SHALL display the 10 most recent delivery attempts per webhook, showing `event`, `status`, `responseMs`, `success`, and `createdAt`.
7. THE Webhook_Dashboard SHALL provide a "Send test" button that calls `POST /api/v1/webhooks/[id]/test` and displays the delivery result inline.
8. WHEN a webhook has `failCount` greater than 5, THE Webhook_Dashboard SHALL display a warning badge on that webhook row.
9. THE Webhook_Dashboard SHALL display the plan's webhook quota (e.g., "1 of 1 webhooks used" for Free plan).

---

### Requirement 10: Plan Gating & Quota Enforcement

**User Story:** As a platform operator, I want all business modules to respect plan limits, so that Free users cannot access Pro features and usage stays within plan quotas.

#### Acceptance Criteria

1. THE Context_Optimizer SHALL only be invoked when `PlanLimit.contextOptimizerEnabled` is `true` for the user's plan.
2. THE Model_Router SHALL only be invoked when `PlanLimit.modelRouterEnabled` is `true` for the user's plan.
3. WHERE `advancedAnalytics` is `false` in `PlanLimit`, THE Usage_API SHALL omit `byModel`, `byProvider`, and trend data from responses.
4. THE Webhook_Engine SHALL enforce `PlanLimit.maxWebhooks` and return HTTP 429 when the limit is reached.
5. WHEN a Free plan user's `totalTokens` for the current month reaches 50,000, THE Plan_Guard SHALL return `{ allowed: false }` for subsequent requests.
6. WHEN a Pro plan user's `totalTokens` for the current month reaches 2,000,000, THE Plan_Guard SHALL return `{ allowed: true, overage: true }` (soft limit, not hard block).
7. WHEN a Team plan user's `totalTokens` for the current month reaches 10,000,000, THE Plan_Guard SHALL return `{ allowed: true, overage: true }` (soft limit, not hard block).
8. WHEN an Enterprise plan user makes a request, THE Plan_Guard SHALL always return `{ allowed: true }` for token quota checks (unlimited).
9. THE Plan_Guard SHALL cache plan limits in Redis with a 5-minute TTL and SHALL fall back to the database on cache miss.
10. WHEN a plan is upgraded, THE Plan_Guard SHALL invalidate the Redis cache for that plan type within 60 seconds.

---

### Requirement 11: Worker Infrastructure & Reliability

**User Story:** As a platform operator, I want the BullMQ workers to be production-grade with proper error handling, graceful shutdown, and observability, so that background jobs are processed reliably.

#### Acceptance Criteria

1. THE Webhook_Worker and Analytics_Worker SHALL connect to Redis using IORedis with the `REDIS_URL` environment variable.
2. WHEN a worker process receives `SIGTERM` or `SIGINT`, THE Worker SHALL complete in-flight jobs and close the queue connection gracefully before exiting.
3. THE Webhook_Worker SHALL emit a `failed` event to the console (and Sentry if configured) when a job exhausts all retries.
4. THE Analytics_Worker SHALL emit a `failed` event to the console when a job exhausts all retries.
5. THE Webhook_Worker SHALL use a `removeOnComplete: { count: 1000 }` and `removeOnFail: { count: 5000 }` job retention policy.
6. THE Analytics_Worker SHALL use a `removeOnComplete: { count: 5000 }` and `removeOnFail: { count: 10000 }` job retention policy.
7. WHEN the Redis connection is lost, THE Workers SHALL attempt reconnection with exponential backoff up to 10 retries before exiting.
8. THE Webhook_Worker and Analytics_Worker SHALL be startable via `pnpm workers` (a script defined in `package.json`).
9. THE Workers SHALL log job start, completion, and failure events with `jobId`, `queue`, `attemptsMade`, and `processingTimeMs`.

---

### Requirement 12: Data Integrity & Security

**User Story:** As a platform operator, I want all business module data to be isolated per user, validated at ingestion, and protected against injection and replay attacks.

#### Acceptance Criteria

1. THE Webhook_Engine SHALL validate that the target `url` is an HTTPS URL before enqueuing a delivery job.
2. THE Webhook_Worker SHALL set a 10-second HTTP timeout on all delivery requests.
3. THE Webhook_Worker SHALL NOT follow HTTP redirects during delivery.
4. THE Analytics_Worker SHALL validate that `costUsd >= 0` and `totalTokens >= 0` before writing to the database.
5. THE Analytics_Worker SHALL validate that `totalTokens == promptTokens + completionTokens` before writing to the database, and SHALL log a warning and use `promptTokens + completionTokens` if they differ.
6. THE Usage_API SHALL enforce user ownership on all `projectId` filters, returning HTTP 403 for projects not owned by the authenticated user.
7. THE Webhook_API SHALL enforce user ownership on all webhook operations, returning HTTP 403 for webhooks not owned by the authenticated user.
8. THE Context_Optimizer SHALL NOT log or persist the content of compressed messages.
9. THE Model_Router SHALL NOT expose the Routing_Score or internal scoring weights in any API response.
10. WHEN a webhook delivery receives a response body larger than 1MB, THE Webhook_Worker SHALL truncate the stored response body to 1MB and append `[truncated]`.

---

### Requirement 13: Observability & Metrics

**User Story:** As a platform operator, I want key metrics from all business modules emitted to the console and Sentry, so that I can monitor system health and debug issues in production.

#### Acceptance Criteria

1. THE Context_Optimizer SHALL log `{ savedTokens, originalTokens, optimizedTokens, technique, durationMs }` at the `debug` level for each compression operation.
2. THE Model_Router SHALL log `{ requestedModel, selectedModel, routed, scoringDurationMs }` at the `debug` level for each routing decision.
3. THE Webhook_Worker SHALL log `{ webhookId, event, deliveryId, statusCode, responseMs, attempt, success }` at the `info` level for each delivery attempt.
4. THE Analytics_Worker SHALL log `{ jobId, userId, totalTokens, costUsd, processingMs }` at the `debug` level for each processed job.
5. WHEN a Webhook_Worker job fails after all retries, THE Webhook_Worker SHALL capture the error to Sentry with `{ webhookId, event, url, lastError }` as context.
6. WHEN an Analytics_Worker job fails after all retries, THE Analytics_Worker SHALL capture the error to Sentry with `{ userId, totalTokens, model }` as context.
