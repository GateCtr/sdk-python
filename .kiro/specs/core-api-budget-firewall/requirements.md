# Requirements Document: Core API & Budget Firewall

## Introduction

This document specifies the requirements for Phase 3 of the GateCtr platform: the Core API & Budget Firewall. This phase delivers the production-ready LLM gateway layer — the core value proposition of GateCtr. It covers API key lifecycle management, an authentication middleware that validates API keys on every inbound request, the main LLM proxy endpoints (`POST /api/v1/complete` and `POST /api/v1/chat`), a Budget Firewall that enforces hard token/cost caps and soft threshold alerts per user and per project, per-key and per-project rate limiting, LLM provider key management (AES-256-GCM encrypted), usage logging, cost calculation, and webhook dispatch for budget events.

The system sits between user applications and LLM providers (OpenAI, Anthropic, Mistral, Gemini). It must be transparent to callers — accepting OpenAI-compatible request/response shapes — while enforcing all budget and rate constraints before forwarding to the upstream provider.

## Glossary

- **Gateway**: The GateCtr middleware layer that proxies LLM requests
- **API_Key**: A user-generated credential (`gct_` prefix) used to authenticate against the Gateway
- **Auth_Middleware**: The Next.js route handler logic that validates API_Key on every inbound request
- **Budget_Firewall**: The enforcement layer that checks token/cost limits before forwarding requests
- **Budget**: A Prisma `Budget` record scoped to a user or a project, defining token/cost caps and alert thresholds
- **LLM_Provider**: An upstream LLM service (OpenAI, Anthropic, Mistral, Gemini)
- **LLM_Provider_Key**: A user's own API key for an LLM_Provider, stored AES-256-GCM encrypted
- **Usage_Log**: A `UsageLog` Prisma record capturing tokens, cost, latency, and metadata for each proxied request
- **Daily_Usage_Cache**: A `DailyUsageCache` Prisma record aggregating daily token/request/cost totals per user and project
- **Rate_Limiter**: Redis sliding-window counter enforcing requests-per-minute limits
- **Model_Catalog**: The `ModelCatalog` Prisma table mapping model IDs to providers, context windows, and per-token costs
- **Request_Hash**: A SHA-256 hash of the normalized request payload used for idempotency and cache lookup
- **Scope**: A permission string on an API_Key (e.g., `"complete"`, `"chat"`, `"read"`, `"admin"`)
- **Hard_Stop**: Budget mode where requests are blocked once the cap is reached
- **Soft_Alert**: Budget mode where requests continue but an alert event is dispatched when the threshold is crossed
- **Alert_Threshold**: The percentage of budget consumed that triggers a Soft_Alert (default 80%)
- **Overage**: Token consumption beyond the plan's monthly limit, applicable to PRO and TEAM plans
- **Plan_Guard**: The `lib/plan-guard.ts` module enforcing plan-level quotas
- **Webhook_Dispatcher**: The `lib/webhooks.ts` module dispatching GateCtr events to user-configured endpoints
- **Context_Optimizer**: Pro feature that compresses prompts before forwarding (gated by `contextOptimizerEnabled`)
- **Model_Router**: Pro feature that selects the optimal model/provider (gated by `modelRouterEnabled`)
- **Audit_Logger**: The `lib/audit.ts` module recording security-relevant events


## Requirements

### Requirement 1: API Key Generation and Lifecycle

**User Story:** As a developer, I want to generate and manage API keys, so that I can authenticate my application against the GateCtr Gateway.

#### Acceptance Criteria

1. WHEN a user sends `POST /api/v1/api-keys` with a `name` field, THE Gateway SHALL generate a unique API_Key with format `gct_` followed by 48 hex characters
2. THE Gateway SHALL store only the SHA-256 hash of the raw API_Key in the `keyHash` field — the raw key SHALL NOT be persisted
3. THE Gateway SHALL store the first 12 characters of the raw key as the `prefix` field for lookup
4. WHEN an API_Key is created, THE Gateway SHALL return the raw key exactly once in the response body — it SHALL NOT be retrievable again
5. WHEN a user provides a `projectId` in the creation request, THE Gateway SHALL associate the API_Key with that project
6. WHEN a user provides `scopes` in the creation request, THE Gateway SHALL store those scopes; IF no scopes are provided, THE Gateway SHALL default to `["complete", "read"]`
7. WHEN a user sends `GET /api/v1/api-keys`, THE Gateway SHALL return all API_Keys for that user with prefix, name, scopes, and metadata — never the raw key or hash
8. WHEN a user sends `DELETE /api/v1/api-keys/{id}`, THE Gateway SHALL set `isActive = false` on the API_Key record
9. IF a user attempts to create an API_Key when their plan's `maxApiKeys` limit is reached, THEN THE Gateway SHALL return HTTP 429 with `error: "quota_exceeded"`
10. WHEN an API_Key has an `expiresAt` date in the past, THE Auth_Middleware SHALL treat it as inactive
11. FOR ALL generated API_Keys, the prefix SHALL equal the first 12 characters of the raw key (structural invariant)
12. FOR ALL generated API_Keys, SHA-256(raw_key) SHALL equal the stored `keyHash` (round-trip property)


### Requirement 2: API Key Authentication Middleware

**User Story:** As a developer, I want my API requests authenticated via API key, so that only authorized callers can access the Gateway endpoints.

#### Acceptance Criteria

1. WHEN a request arrives at `/api/v1/complete` or `/api/v1/chat`, THE Auth_Middleware SHALL extract the API_Key from the `Authorization: Bearer <key>` header
2. IF no `Authorization` header is present, THEN THE Auth_Middleware SHALL return HTTP 401 with `{ error: "missing_api_key" }`
3. WHEN an API_Key is provided, THE Auth_Middleware SHALL look up the matching record by prefix (first 12 characters) then verify SHA-256(provided_key) == stored `keyHash`
4. IF the hash does not match, THEN THE Auth_Middleware SHALL return HTTP 401 with `{ error: "invalid_api_key" }`
5. IF the matched API_Key has `isActive = false`, THEN THE Auth_Middleware SHALL return HTTP 401 with `{ error: "api_key_revoked" }`
6. IF the matched API_Key has `expiresAt` in the past, THEN THE Auth_Middleware SHALL return HTTP 401 with `{ error: "api_key_expired" }`
7. WHEN authentication succeeds, THE Auth_Middleware SHALL attach the resolved `userId`, `apiKeyId`, and `scopes` to the request context for downstream handlers
8. WHEN authentication succeeds, THE Auth_Middleware SHALL update `lastUsedAt` and `lastUsedIp` on the API_Key record asynchronously (fire-and-forget, non-blocking)
9. THE Auth_Middleware SHALL also accept Clerk session authentication for dashboard-originated requests, falling back to API_Key auth when no Clerk session is present
10. FOR ALL authentication attempts with an invalid key, THE Auth_Middleware SHALL log the attempt to the Audit_Logger with resource `"api_key"`, action `"auth_failed"`, and the request IP address
11. FOR ALL valid API_Keys K, authenticate(K) SHALL succeed immediately after creation (round-trip property)
12. FOR ALL revoked API_Keys K, authenticate(K) SHALL return 401 after revocation (error condition property)


### Requirement 3: API Key Scope Enforcement

**User Story:** As a platform operator, I want API keys to carry scopes, so that keys can be restricted to specific operations.

#### Acceptance Criteria

1. THE Gateway SHALL define the following valid scopes: `"complete"`, `"chat"`, `"read"`, `"admin"`
2. WHEN a request reaches `POST /api/v1/complete`, THE Auth_Middleware SHALL verify the API_Key includes the `"complete"` scope
3. WHEN a request reaches `POST /api/v1/chat`, THE Auth_Middleware SHALL verify the API_Key includes the `"chat"` scope
4. IF the API_Key does not include the required scope, THEN THE Auth_Middleware SHALL return HTTP 403 with `{ error: "insufficient_scope", required: "<scope>" }`
5. WHEN a Clerk-authenticated dashboard request is used, THE Auth_Middleware SHALL bypass scope checks (dashboard users have full access)
6. FOR ALL API_Keys K with scopes S, a request to an endpoint requiring scope R where R ∉ S SHALL return 403 (scope enforcement property)
7. FOR ALL API_Keys K with scopes S, a request to an endpoint requiring scope R where R ∈ S SHALL not be rejected for scope reasons (positive scope property)


### Requirement 4: LLM Provider Key Management

**User Story:** As a developer, I want to store my LLM provider API keys securely in GateCtr, so that the Gateway can forward requests on my behalf without exposing my keys.

#### Acceptance Criteria

1. WHEN a user sends `POST /api/v1/provider-keys` with `{ provider, apiKey, name }`, THE Gateway SHALL encrypt the `apiKey` using AES-256-GCM via `lib/encryption.ts` and store the result in `LLMProviderKey.encryptedApiKey`
2. THE Gateway SHALL support the following provider values: `"openai"`, `"anthropic"`, `"mistral"`, `"gemini"`
3. IF an invalid provider value is supplied, THEN THE Gateway SHALL return HTTP 400 with `{ error: "invalid_provider" }`
4. WHEN a user sends `GET /api/v1/provider-keys`, THE Gateway SHALL return all `LLMProviderKey` records for that user with `id`, `provider`, `name`, `isActive`, `lastUsedAt` — never the decrypted key
5. WHEN a user sends `DELETE /api/v1/provider-keys/{id}`, THE Gateway SHALL set `isActive = false` on the record
6. WHEN the Gateway needs to forward a request to an LLM_Provider, THE Gateway SHALL decrypt the matching `LLMProviderKey` using `lib/encryption.ts` and use it as the upstream `Authorization` header
7. IF no active `LLMProviderKey` exists for the required provider, THEN THE Gateway SHALL return HTTP 422 with `{ error: "no_provider_key", provider: "<provider>" }`
8. FOR ALL provider keys K, decrypt(encrypt(K.apiKey)) SHALL equal K.apiKey (round-trip encryption property)
9. THE Gateway SHALL enforce uniqueness of `(userId, provider, name)` — duplicate names for the same provider SHALL return HTTP 409


### Requirement 5: POST /api/v1/complete — LLM Completion Proxy

**User Story:** As a developer, I want to send completion requests to GateCtr using the OpenAI API format, so that I can swap my endpoint without changing my code.

#### Acceptance Criteria

1. THE Gateway SHALL accept `POST /api/v1/complete` with a JSON body containing at minimum `{ model, prompt }` and optionally `{ max_tokens, temperature, stream, projectId }`
2. WHEN a request is received, THE Gateway SHALL run Auth_Middleware, then Budget_Firewall checks, then Rate_Limiter checks — in that order — before forwarding to the LLM_Provider
3. THE Gateway SHALL resolve the LLM_Provider for the requested `model` by looking up `ModelCatalog.modelId`; IF the model is not found, THE Gateway SHALL return HTTP 400 with `{ error: "unknown_model" }`
4. THE Gateway SHALL decrypt the user's `LLMProviderKey` for the resolved provider and forward the request to the provider's base URL
5. WHEN the LLM_Provider returns a successful response, THE Gateway SHALL return an OpenAI-compatible response shape: `{ id, object: "text_completion", model, choices, usage }`
6. THE Gateway SHALL record a `UsageLog` entry with `promptTokens`, `completionTokens`, `totalTokens`, `costUsd`, `latencyMs`, `statusCode`, `provider`, `model`, `userId`, `apiKeyId`, `projectId`
7. THE Gateway SHALL update `DailyUsageCache` for the current date, incrementing `totalTokens`, `totalRequests`, and `totalCostUsd`
8. WHEN `stream: true` is set in the request, THE Gateway SHALL proxy the SSE stream from the LLM_Provider directly to the caller using `Transfer-Encoding: chunked`
9. IF the LLM_Provider returns a 4xx or 5xx error, THE Gateway SHALL return HTTP 502 with `{ error: "provider_error", provider, status, message }` and log the error to Sentry
10. THE Gateway SHALL calculate `costUsd` as `(promptTokens * inputCostPer1kTokens + completionTokens * outputCostPer1kTokens) / 1000` using values from `ModelCatalog`
11. WHEN `overage: true` is returned by Plan_Guard, THE Gateway SHALL include `"x-gatectr-overage": "true"` in the response headers
12. WHERE the `contextOptimizerEnabled` feature flag is true for the user's plan, THE Gateway SHALL apply Context_Optimizer to the prompt before forwarding and record `savedTokens` in the Usage_Log
13. WHERE the `modelRouterEnabled` feature flag is true for the user's plan, THE Gateway SHALL allow Model_Router to override the requested model and record `routed: true` in the Usage_Log


### Requirement 6: POST /api/v1/chat — Chat Completion Proxy

**User Story:** As a developer, I want to send chat completion requests to GateCtr using the OpenAI chat format, so that I can use any chat-capable LLM through a single endpoint.

#### Acceptance Criteria

1. THE Gateway SHALL accept `POST /api/v1/chat` with a JSON body containing at minimum `{ model, messages }` where `messages` is an array of `{ role, content }` objects, and optionally `{ max_tokens, temperature, stream, projectId }`
2. WHEN a request is received, THE Gateway SHALL run Auth_Middleware, then Budget_Firewall checks, then Rate_Limiter checks — in that order — before forwarding
3. THE Gateway SHALL resolve the LLM_Provider for the requested `model` via `ModelCatalog`; IF the model does not support the `"chat"` capability, THE Gateway SHALL return HTTP 400 with `{ error: "model_not_chat_capable" }`
4. THE Gateway SHALL return an OpenAI-compatible chat response shape: `{ id, object: "chat.completion", model, choices: [{ message: { role, content }, finish_reason }], usage }`
5. THE Gateway SHALL record a `UsageLog` entry with the same fields as Requirement 5.6
6. THE Gateway SHALL update `DailyUsageCache` as in Requirement 5.7
7. WHEN `stream: true` is set, THE Gateway SHALL proxy the SSE stream from the LLM_Provider to the caller
8. IF the LLM_Provider returns an error, THE Gateway SHALL return HTTP 502 with the same error shape as Requirement 5.9
9. WHERE `contextOptimizerEnabled` is true, THE Gateway SHALL apply Context_Optimizer to the messages array before forwarding
10. WHERE `modelRouterEnabled` is true, THE Gateway SHALL allow Model_Router to select the optimal model


### Requirement 7: Budget Firewall — Hard Stop and Soft Alert

**User Story:** As a developer, I want to set hard token/cost caps on my account and projects, so that I never receive a surprise invoice from my LLM provider.

#### Acceptance Criteria

1. THE Budget_Firewall SHALL check both user-level and project-level `Budget` records before forwarding any request; the stricter limit SHALL take precedence
2. WHEN a user's or project's `totalTokens` for the current month reaches `Budget.maxTokensPerMonth` and `Budget.hardStop = true`, THE Budget_Firewall SHALL block the request and return HTTP 429 with `{ error: "budget_exceeded", scope: "user"|"project", limit, current, upgradeUrl: "/billing" }`
3. WHEN a user's or project's `totalCostUsd` for the current month reaches `Budget.maxCostPerMonth` and `Budget.hardStop = true`, THE Budget_Firewall SHALL block the request with the same HTTP 429 response
4. WHEN `Budget.hardStop = false` and the limit is reached, THE Budget_Firewall SHALL allow the request to proceed and set `overage: true` in the result
5. WHEN token consumption crosses `Budget.alertThresholdPct` percent of `maxTokensPerMonth` for the first time in a billing period, THE Budget_Firewall SHALL dispatch a `"budget.threshold"` webhook event via Webhook_Dispatcher with `{ tokens_used, tokens_limit, percent, cost_usd }`
6. WHEN token consumption crosses `Budget.alertThresholdPct` percent of `maxCostPerMonth` for the first time in a billing period, THE Budget_Firewall SHALL dispatch a `"budget.threshold"` webhook event
7. WHEN a hard stop is triggered, THE Budget_Firewall SHALL dispatch a `"budget.exceeded"` webhook event
8. THE Budget_Firewall SHALL use `DailyUsageCache` aggregated over the current calendar month for token/cost totals — it SHALL NOT query `UsageLog` directly for performance
9. WHEN `Budget.notifyOnThreshold = true`, THE Budget_Firewall SHALL also send a budget threshold email via `lib/resend.ts` in addition to the webhook
10. WHEN `Budget.notifyOnExceeded = true`, THE Budget_Firewall SHALL also send a budget exceeded email
11. FOR ALL users U where monthly_tokens(U) >= budget(U).maxTokensPerMonth and budget(U).hardStop = true, complete(U) SHALL return 429 (hard stop property)
12. FOR ALL threshold crossings, the `"budget.threshold"` event SHALL be dispatched exactly once per billing period per threshold (idempotence property — use Redis key `budget:alert:{userId|projectId}:{YYYY-MM}` with SET NX)
13. THE Budget_Firewall SHALL also enforce plan-level quotas via Plan_Guard in addition to user-defined Budget records; the stricter of the two SHALL apply


### Requirement 8: Budget Configuration API

**User Story:** As a developer, I want to create and update budget limits for my account and projects via API, so that I can programmatically control spending.

#### Acceptance Criteria

1. WHEN a user sends `POST /api/v1/budget` with `{ maxTokensPerMonth?, maxCostPerMonth?, alertThresholdPct?, hardStop?, notifyOnThreshold?, notifyOnExceeded? }`, THE Gateway SHALL create or update the user-level `Budget` record (upsert by `userId`)
2. WHEN a user sends `POST /api/v1/budget` with an additional `projectId` field, THE Gateway SHALL create or update the project-level `Budget` record (upsert by `projectId`)
3. IF `projectId` is provided and the project does not belong to the authenticated user, THEN THE Gateway SHALL return HTTP 403
4. WHEN a user sends `GET /api/v1/budget`, THE Gateway SHALL return the user-level `Budget` record and all project-level `Budget` records for projects owned by the user
5. THE Gateway SHALL validate that `alertThresholdPct` is between 1 and 99 inclusive; IF invalid, THE Gateway SHALL return HTTP 400
6. THE Gateway SHALL validate that `maxTokensPerMonth` and `maxCostPerMonth` are positive numbers when provided; IF invalid, THE Gateway SHALL return HTTP 400
7. WHEN a budget is updated, THE Budget_Firewall SHALL use the new values on the next request — no cache invalidation delay beyond the current request


### Requirement 9: Rate Limiting

**User Story:** As a platform operator, I want per-key and per-project rate limits enforced, so that no single caller can overwhelm the Gateway or upstream providers.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL enforce a sliding-window requests-per-minute limit per API_Key using Redis key `ratelimit:key:{apiKeyId}:rpm`
2. THE Rate_Limiter SHALL enforce a sliding-window requests-per-minute limit per project using Redis key `ratelimit:project:{projectId}:rpm` when a `projectId` is associated with the request
3. THE Rate_Limiter SHALL also enforce the plan-level `maxRequestsPerMinute` limit per user via Plan_Guard
4. WHEN any rate limit is exceeded, THE Rate_Limiter SHALL return HTTP 429 with `{ error: "rate_limit_exceeded", limit, window_seconds: 60 }` and headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
5. IF Redis is unavailable, THE Rate_Limiter SHALL fail-open and allow the request to proceed
6. THE Rate_Limiter SHALL check limits in order: API_Key limit → project limit → plan limit; the first exceeded limit SHALL short-circuit and return 429
7. FOR ALL API_Keys K with limit N, the (N+1)th request within a 60-second window SHALL return 429 (rate limit enforcement property)
8. FOR ALL API_Keys K with limit N, N requests within a 60-second window SHALL all be allowed (positive rate limit property)


### Requirement 10: Usage Logging and Cost Calculation

**User Story:** As a developer, I want every proxied request logged with accurate token counts and costs, so that I can track spending and usage in real time.

#### Acceptance Criteria

1. THE Gateway SHALL create a `UsageLog` record for every request that reaches the LLM_Provider, regardless of the provider's response status
2. THE Gateway SHALL calculate `costUsd` using the formula: `(promptTokens * inputCostPer1kTokens + completionTokens * outputCostPer1kTokens) / 1000` with values from `ModelCatalog`
3. IF the model is not found in `ModelCatalog`, THE Gateway SHALL use `costUsd = 0` and log a warning to Sentry
4. THE Gateway SHALL record `latencyMs` as the elapsed time from request forwarding to provider response receipt
5. THE Gateway SHALL record `statusCode` from the LLM_Provider response; IF the provider errored, THE Gateway SHALL record the provider's HTTP status code
6. THE Gateway SHALL update `DailyUsageCache` atomically after each request using an upsert on `(userId, projectId, date)`, incrementing `totalTokens`, `totalRequests`, `totalCostUsd`, and `savedTokens`
7. WHEN `optimized: true` is set on the Usage_Log, THE Gateway SHALL also create an `OptimizationLog` record with `originalTokens`, `optimizedTokens`, `savedTokens`, and `technique`
8. FOR ALL successful requests, count(UsageLog) SHALL increase by exactly 1 (invariant property)
9. FOR ALL requests, costUsd SHALL be >= 0 (non-negative cost invariant)
10. FOR ALL requests, totalTokens = promptTokens + completionTokens (token sum invariant)


### Requirement 11: Usage Query API

**User Story:** As a developer, I want to query my token usage and costs via API, so that I can build dashboards and monitor spending programmatically.

#### Acceptance Criteria

1. WHEN a user sends `GET /api/v1/usage`, THE Gateway SHALL return aggregated usage for the current calendar month: `{ totalTokens, totalRequests, totalCostUsd, savedTokens, byModel: [...], byProject: [...] }`
2. WHEN a user sends `GET /api/v1/usage?from=YYYY-MM-DD&to=YYYY-MM-DD`, THE Gateway SHALL return aggregated usage for the specified date range using `DailyUsageCache`
3. WHEN a user sends `GET /api/v1/usage/summary`, THE Gateway SHALL return the existing summary endpoint response including plan limits and percentage consumed
4. WHEN a `projectId` query parameter is provided, THE Gateway SHALL filter usage to that project only
5. IF the requesting user does not own the specified `projectId`, THEN THE Gateway SHALL return HTTP 403
6. THE Gateway SHALL compute usage totals from `DailyUsageCache` — it SHALL NOT perform full table scans on `UsageLog` for summary queries
7. THE Gateway SHALL include `budgetStatus: { tokensUsed, tokensLimit, costUsed, costLimit, percentUsed, alertThreshold, hardStop }` in the response when a `Budget` record exists for the user or project


### Requirement 12: LLM Provider Fallback and Retry

**User Story:** As a developer, I want the Gateway to retry failed provider requests and fall back to an alternative provider, so that transient failures do not surface as errors to my application.

#### Acceptance Criteria

1. WHEN an LLM_Provider returns a 5xx error or a network timeout, THE Gateway SHALL retry the request up to `LLMProviderConfig.maxRetries` times with `LLMProviderConfig.retryDelay` milliseconds between attempts
2. WHEN all retries for the primary provider are exhausted, THE Gateway SHALL attempt to fall back to an alternative provider if the user has an active `LLMProviderKey` for a provider that supports the same model capability
3. WHEN a fallback provider is used, THE Gateway SHALL set `fallback: true` on the `UsageLog` record
4. IF no fallback is available and all retries are exhausted, THE Gateway SHALL return HTTP 502 with `{ error: "provider_unavailable", provider, retries_attempted }`
5. THE Gateway SHALL respect `LLMProviderConfig.defaultTimeout` as the per-attempt timeout; IF a provider does not respond within the timeout, THE Gateway SHALL treat it as a 5xx error for retry purposes
6. THE Gateway SHALL log each retry attempt to Sentry with provider, attempt number, and error details
7. FOR ALL requests where fallback is used, `UsageLog.fallback` SHALL be `true` (fallback tracking invariant)


### Requirement 13: Request Pipeline — Ordering and Atomicity

**User Story:** As a platform operator, I want the request pipeline to execute checks in a defined order and handle partial failures gracefully, so that the system remains consistent under load.

#### Acceptance Criteria

1. THE Gateway SHALL execute the request pipeline in the following strict order for every `/api/v1/complete` and `/api/v1/chat` request: (1) Auth_Middleware → (2) Scope check → (3) Budget_Firewall → (4) Rate_Limiter → (5) Context_Optimizer (if enabled) → (6) Model_Router (if enabled) → (7) LLM_Provider forward → (8) Usage_Log write → (9) DailyUsageCache update → (10) Webhook_Dispatcher (fire-and-forget)
2. IF any step from (1) through (6) fails, THE Gateway SHALL return the appropriate error response and SHALL NOT forward the request to the LLM_Provider
3. IF the LLM_Provider forward (step 7) fails after all retries, THE Gateway SHALL still attempt to write a `UsageLog` record with `statusCode` set to the provider error code
4. THE Gateway SHALL write `UsageLog` and update `DailyUsageCache` (steps 8–9) asynchronously after returning the response to the caller, to minimize response latency
5. IF `UsageLog` write fails, THE Gateway SHALL log the error to Sentry but SHALL NOT return an error to the caller — the LLM response has already been delivered
6. THE Webhook_Dispatcher calls (step 10) SHALL always be fire-and-forget — errors SHALL be caught internally and SHALL NOT affect the response


### Requirement 14: Performance Requirements

**User Story:** As a developer, I want the Gateway to add minimal latency to my LLM requests, so that GateCtr is transparent to my application's performance.

#### Acceptance Criteria

1. THE Gateway SHALL add no more than 50 milliseconds of overhead (auth + budget + rate limit checks) to each request, measured as the time from request receipt to LLM_Provider forward initiation, when all checks pass from cache
2. WHEN plan limits are cached in Redis, THE Plan_Guard SHALL complete quota checks within 10 milliseconds
3. WHEN plan limits require a database query (cache miss), THE Plan_Guard SHALL complete within 100 milliseconds
4. THE Budget_Firewall SHALL read token totals from `DailyUsageCache` — it SHALL NOT aggregate `UsageLog` records at request time
5. THE Auth_Middleware SHALL complete API_Key validation within 20 milliseconds when the key prefix lookup hits the database index
6. WHILE Redis is unavailable, THE Gateway SHALL fall back to database-only checks and SHALL NOT reject requests solely due to Redis unavailability (fail-open for rate limiting and plan cache)
7. THE Gateway SHALL set a `X-GateCtr-Latency-Ms` response header containing the total Gateway overhead in milliseconds (excluding LLM_Provider response time)


### Requirement 15: Security Requirements

**User Story:** As a security officer, I want all API key operations and LLM proxy requests to follow security best practices, so that user credentials and data are protected.

#### Acceptance Criteria

1. THE Gateway SHALL never log or return the raw API_Key value after the initial creation response
2. THE Gateway SHALL never log or return the decrypted `LLMProviderKey` value in any response, log, or error message
3. THE Auth_Middleware SHALL use constant-time comparison when verifying SHA-256 hashes to prevent timing attacks
4. THE Gateway SHALL validate and sanitize all request body fields before forwarding to LLM_Provider — it SHALL strip any fields not in the provider's accepted schema
5. THE Gateway SHALL enforce a maximum request body size of 1 MB for `/api/v1/complete` and `/api/v1/chat`; IF exceeded, THE Gateway SHALL return HTTP 413
6. THE Gateway SHALL include `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY` headers on all API responses
7. WHEN an API_Key authentication fails 10 times within 5 minutes from the same IP address, THE Auth_Middleware SHALL temporarily block that IP for 15 minutes and log the event to the Audit_Logger with action `"brute_force_detected"`
8. THE Gateway SHALL record `ipAddress` on every `UsageLog` entry for audit purposes
9. THE Gateway SHALL validate that the `model` field in requests does not contain injection characters (e.g., newlines, null bytes) before using it in provider API calls


### Requirement 16: Error Response Consistency

**User Story:** As a developer, I want all Gateway errors to follow a consistent JSON schema, so that I can handle errors programmatically without parsing free-form messages.

#### Acceptance Criteria

1. THE Gateway SHALL return all error responses as JSON with at minimum `{ error: string, code?: string }` — never plain text or HTML
2. THE Gateway SHALL use the following HTTP status codes consistently: 400 for invalid input, 401 for authentication failure, 403 for authorization failure, 404 for not found, 409 for conflict, 413 for payload too large, 422 for unprocessable entity, 429 for rate limit or quota exceeded, 502 for provider error, 500 for internal error
3. WHEN returning 429 for quota or rate limit, THE Gateway SHALL include `{ error, quota|limit, current, upgradeUrl }` in the body and `Retry-After` in the headers
4. WHEN returning 502 for a provider error, THE Gateway SHALL include `{ error: "provider_error", provider, status, message }` — it SHALL NOT expose the raw provider error body if it contains sensitive data
5. THE Gateway SHALL include a `X-GateCtr-Request-Id` header on every response containing a unique request identifier for support tracing
6. FOR ALL error responses, the body SHALL be valid JSON parseable without error (error format invariant)


### Requirement 17: Budget Alert Emails

**User Story:** As a developer, I want to receive email notifications when my budget thresholds are crossed, so that I can take action before hitting hard limits.

#### Acceptance Criteria

1. WHEN `Budget.notifyOnThreshold = true` and the alert threshold is crossed for the first time in a billing period, THE Gateway SHALL send a budget threshold email via `lib/resend.ts` with `{ tokensUsed, tokensLimit, percentUsed, projectName? }`
2. WHEN `Budget.notifyOnExceeded = true` and a hard stop is triggered, THE Gateway SHALL send a budget exceeded email with `{ tokensUsed, tokensLimit, hardStop: true, upgradeUrl }`
3. THE Gateway SHALL send budget emails asynchronously (fire-and-forget via BullMQ `billing-emails` queue) — email failures SHALL NOT block the request pipeline
4. IF the email send fails, THE Gateway SHALL log the error to Sentry but SHALL NOT retry more than once
5. THE Gateway SHALL record each budget email in the `EmailLog` table with `template: "budget_threshold"` or `"budget_exceeded"` and `status: SENT` or `FAILED`
6. THE Gateway SHALL respect the user's locale preference when sending budget emails, defaulting to English


### Requirement 18: Model Catalog and Provider Configuration

**User Story:** As a platform operator, I want a maintained catalog of supported models and their costs, so that the Gateway can accurately route requests and calculate costs.

#### Acceptance Criteria

1. THE Gateway SHALL resolve every incoming `model` field against `ModelCatalog.modelId` to determine the provider, base URL, context window, and per-token costs
2. THE Gateway SHALL support at minimum the following models at launch: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo` (OpenAI); `claude-3-opus-20240229`, `claude-3-sonnet-20240229`, `claude-3-haiku-20240307` (Anthropic); `mistral-large-latest`, `mistral-small-latest` (Mistral); `gemini-1.5-pro`, `gemini-1.5-flash` (Gemini)
3. WHEN a model is requested that is not in `ModelCatalog` or has `isActive = false`, THE Gateway SHALL return HTTP 400 with `{ error: "unknown_model", model }`
4. THE Gateway SHALL read `LLMProviderConfig.baseUrl` and `LLMProviderConfig.defaultTimeout` from the database for each provider — these SHALL NOT be hardcoded
5. WHEN `LLMProviderConfig.isActive = false` for a provider, THE Gateway SHALL treat all models from that provider as unavailable and return HTTP 503 with `{ error: "provider_disabled", provider }`
6. THE Gateway SHALL expose `GET /api/v1/models` returning the list of active models from `ModelCatalog` with `{ modelId, displayName, provider, contextWindow, capabilities }` — this endpoint SHALL NOT require authentication


### Requirement 19: Webhook Dispatch for Gateway Events

**User Story:** As a developer, I want the Gateway to push events to my configured webhooks when significant things happen, so that I can integrate GateCtr into my monitoring and alerting pipelines.

#### Acceptance Criteria

1. THE Webhook_Dispatcher SHALL dispatch a `"request.completed"` event after each successful LLM proxy request with `{ model, provider, promptTokens, completionTokens, totalTokens, costUsd, latencyMs, projectId? }`
2. THE Webhook_Dispatcher SHALL dispatch a `"budget.threshold"` event when the alert threshold is crossed with `{ scope: "user"|"project", tokensUsed, tokensLimit, percent, costUsd, projectId? }`
3. THE Webhook_Dispatcher SHALL dispatch a `"budget.exceeded"` event when a hard stop is triggered with `{ scope: "user"|"project", tokensUsed, tokensLimit, costUsd, projectId? }`
4. THE Webhook_Dispatcher SHALL dispatch a `"api_key.created"` event when a new API_Key is created with `{ keyId, name, scopes, projectId? }`
5. THE Webhook_Dispatcher SHALL dispatch a `"api_key.revoked"` event when an API_Key is deactivated with `{ keyId, name }`
6. ALL webhook dispatches SHALL be fire-and-forget — they SHALL NOT block the request pipeline
7. THE Webhook_Dispatcher SHALL only dispatch events to webhooks that have the relevant event type in their `events` array
8. THE Webhook_Dispatcher SHALL sign each delivery with `X-GateCtr-Signature: HMAC-SHA256(secret, payload)` using the webhook's `secret` field


### Requirement 20: Audit Logging for Gateway Operations

**User Story:** As a compliance officer, I want all security-relevant Gateway operations logged, so that I can audit API key usage, budget enforcement actions, and authentication failures.

#### Acceptance Criteria

1. WHEN an API_Key is created, THE Audit_Logger SHALL record `{ resource: "api_key", action: "created", userId, resourceId: apiKeyId }`
2. WHEN an API_Key is revoked, THE Audit_Logger SHALL record `{ resource: "api_key", action: "revoked", userId, resourceId: apiKeyId }`
3. WHEN an authentication attempt fails, THE Audit_Logger SHALL record `{ resource: "api_key", action: "auth_failed", ipAddress }` — without a userId since the key is invalid
4. WHEN a Budget_Firewall hard stop is triggered, THE Audit_Logger SHALL record `{ resource: "budget", action: "hard_stop", userId, resourceId: budgetId, newValue: { tokensUsed, limit } }`
5. WHEN a brute-force IP block is applied (Requirement 15.7), THE Audit_Logger SHALL record `{ resource: "security", action: "ip_blocked", ipAddress, newValue: { attempts, blockedUntil } }`
6. THE Audit_Logger SHALL never block the request pipeline — all audit writes SHALL be fire-and-forget with internal error handling
7. THE Audit_Logger SHALL include `ipAddress` and `userAgent` on all entries where the information is available from the request headers


### Requirement 21: lib/api-auth.ts — API Key Authentication Module

**User Story:** As a developer building the Gateway, I want a reusable authentication module, so that API key validation logic is not duplicated across route handlers.

#### Acceptance Criteria

1. THE Gateway SHALL implement `lib/api-auth.ts` exporting an `authenticateApiKey(req: NextRequest)` function that returns `{ userId, apiKeyId, scopes, projectId? }` on success or throws a typed `ApiAuthError` on failure
2. THE `authenticateApiKey` function SHALL extract the bearer token, look up by prefix, verify the SHA-256 hash, check `isActive`, check `expiresAt`, and return the resolved context — all in a single database query using `prisma.apiKey.findFirst({ where: { prefix } })`
3. THE `ApiAuthError` SHALL carry a `code` field with one of: `"missing_api_key"`, `"invalid_api_key"`, `"api_key_revoked"`, `"api_key_expired"`, and an `httpStatus` field
4. THE `authenticateApiKey` function SHALL update `lastUsedAt` and `lastUsedIp` using a non-awaited `prisma.apiKey.update()` call to avoid adding latency
5. THE module SHALL also export `requireScope(scopes: string[], required: string)` that throws `ApiAuthError` with code `"insufficient_scope"` when the required scope is absent
6. FOR ALL valid API_Keys, authenticateApiKey(request_with_valid_key) SHALL return the correct userId and scopes (round-trip property)


### Requirement 22: lib/firewall.ts — Budget Firewall Module

**User Story:** As a developer building the Gateway, I want a reusable Budget Firewall module, so that budget enforcement logic is centralized and testable independently of route handlers.

#### Acceptance Criteria

1. THE Gateway SHALL implement `lib/firewall.ts` exporting a `checkBudget(userId: string, projectId?: string, estimatedTokens?: number)` function that returns `{ allowed: boolean, reason?: string, scope?: "user"|"project", limit?: number, current?: number }`
2. THE `checkBudget` function SHALL check user-level `Budget` first, then project-level `Budget` if `projectId` is provided; the stricter result SHALL be returned
3. THE `checkBudget` function SHALL read current token/cost totals from `DailyUsageCache` aggregated over the current calendar month — it SHALL NOT query `UsageLog`
4. THE `checkBudget` function SHALL also call `Plan_Guard.checkQuota(userId, "tokens_per_month")` and return the stricter of the plan quota result and the budget result
5. THE `checkBudget` function SHALL check the Redis key `budget:alert:{scope}:{id}:{YYYY-MM}` before dispatching threshold alerts, using SET NX to ensure exactly-once dispatch per billing period
6. THE module SHALL export a `recordBudgetUsage(userId: string, projectId?: string, tokens: number, costUsd: number)` function that updates `DailyUsageCache` and re-evaluates threshold alerts after each request
7. FOR ALL users U where monthly_tokens(U) >= budget(U).maxTokensPerMonth and budget(U).hardStop = true, checkBudget(U) SHALL return `{ allowed: false }` (hard stop invariant)
8. FOR ALL threshold crossings, the Redis SET NX pattern SHALL ensure the alert is dispatched exactly once per billing period (idempotence property)


### Requirement 23: lib/llm/ — LLM Provider Adapters

**User Story:** As a developer building the Gateway, I want provider-specific adapter modules, so that each LLM provider's API differences are encapsulated and the proxy logic stays provider-agnostic.

#### Acceptance Criteria

1. THE Gateway SHALL implement `lib/llm/openai.ts`, `lib/llm/anthropic.ts`, `lib/llm/mistral.ts`, and `lib/llm/gemini.ts` each exporting a `complete(params, apiKey)` and `chat(params, apiKey)` function
2. EACH adapter SHALL accept a normalized `GatewayRequest` type and return a normalized `GatewayResponse` type — provider-specific request/response translation SHALL be internal to the adapter
3. EACH adapter SHALL return `{ id, model, promptTokens, completionTokens, totalTokens, content, finishReason, latencyMs }` in the normalized `GatewayResponse`
4. WHEN `stream: true` is requested, EACH adapter SHALL return a `ReadableStream` of SSE chunks in OpenAI-compatible format, regardless of the provider's native streaming format
5. EACH adapter SHALL throw a typed `ProviderError` with `{ provider, status, message, retryable: boolean }` on failure — `retryable: true` for 5xx and timeout errors, `false` for 4xx errors
6. THE Anthropic adapter SHALL translate the OpenAI `messages` format to Anthropic's `system` + `messages` format internally
7. THE Gemini adapter SHALL translate to Google's `contents` format internally
8. FOR ALL providers P and valid requests R, chat(R, key) and complete(R, key) SHALL return a GatewayResponse with totalTokens = promptTokens + completionTokens (token sum invariant)


## Correctness Properties for Property-Based Testing

### Property 1: API Key Hash Round-Trip

**Description:** For all generated API keys, SHA-256(raw_key) equals the stored keyHash, and the prefix equals raw_key.slice(0, 12).
**Test:** For all generated keys K: hash(K.raw) == K.keyHash AND K.raw.slice(0, 12) == K.prefix

### Property 2: API Key Uniqueness

**Description:** No two generated API keys share the same raw value, prefix, or hash.
**Test:** For all pairs (K1, K2) generated independently: K1.raw ≠ K2.raw AND K1.hash ≠ K2.hash

### Property 3: Authentication Round-Trip

**Description:** A freshly created API key authenticates successfully on the next request.
**Test:** For all keys K: create(K) → authenticate(K.raw) succeeds with correct userId and scopes

### Property 4: Revocation Correctness

**Description:** A revoked API key is rejected on all subsequent authentication attempts.
**Test:** For all keys K: revoke(K) → authenticate(K.raw) returns 401 with code "api_key_revoked"

### Property 5: Scope Enforcement

**Description:** A request to an endpoint requiring scope R is rejected when the API key does not include R.
**Test:** For all keys K with scopes S and endpoints E requiring scope R where R ∉ S: request(E, K) returns 403

### Property 6: LLM Provider Key Encryption Round-Trip

**Description:** Decrypting an encrypted provider key always returns the original plaintext.
**Test:** For all provider keys P: decrypt(encrypt(P)) == P

### Property 7: Hard Stop Enforcement

**Description:** When a user's monthly token usage meets or exceeds their hard-stop budget, all subsequent requests are blocked.
**Test:** For all users U where monthly_tokens(U) >= budget(U).maxTokensPerMonth and budget(U).hardStop = true: checkBudget(U) returns { allowed: false }

### Property 8: Budget Alert Idempotence

**Description:** The budget threshold alert fires exactly once per billing period per user/project, regardless of how many requests cross the threshold.
**Test:** For all users U crossing threshold T in month M: count(budget.threshold events for U in M) == 1 after N requests above T, for all N >= 1

### Property 9: Rate Limit Sliding Window

**Description:** Exactly N requests are allowed within a 60-second window when the limit is N; the (N+1)th is rejected.
**Test:** For all API keys K with rpm limit N: requests 1..N all return allowed=true; request N+1 returns 429

### Property 10: Token Sum Invariant

**Description:** For all usage log entries, totalTokens equals promptTokens plus completionTokens.
**Test:** For all UsageLog records L: L.totalTokens == L.promptTokens + L.completionTokens

### Property 11: Cost Non-Negativity

**Description:** Calculated cost is always non-negative.
**Test:** For all UsageLog records L: L.costUsd >= 0

### Property 12: DailyUsageCache Monotonicity

**Description:** After each successful request, the DailyUsageCache totalTokens for today is greater than or equal to its previous value.
**Test:** For all requests R: DailyUsageCache.totalTokens_after >= DailyUsageCache.totalTokens_before

### Property 13: Error Response Format Invariant

**Description:** All error responses from the Gateway are valid JSON containing at minimum an "error" string field.
**Test:** For all error responses R: JSON.parse(R.body) succeeds AND typeof R.body.error == "string"

### Property 14: Fallback Tracking Invariant

**Description:** When a fallback provider is used, the UsageLog record always has fallback = true.
**Test:** For all requests R where fallback provider was used: UsageLog(R).fallback == true

### Property 15: Budget Firewall Stricter-Wins

**Description:** When both user-level and project-level budgets exist, the stricter (lower remaining) limit governs.
**Test:** For all users U with user budget B_u and project budget B_p: checkBudget(U, projectId) returns blocked if either B_u or B_p would block the request

### Property 16: Plan Quota and Budget Firewall Composition

**Description:** The Budget Firewall applies the stricter of the plan quota and the user-defined budget.
**Test:** For all users U: if plan_quota(U).allowed == false OR budget(U).allowed == false, then checkBudget(U) returns { allowed: false }

