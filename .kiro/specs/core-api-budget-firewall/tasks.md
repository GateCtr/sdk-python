# Implementation Plan: Core API & Budget Firewall

## Overview

Implement the production-ready LLM gateway layer for GateCtr. The pipeline follows a strict order: auth → scope → budget firewall → rate limit → optimizer → router → LLM forward → usage log → webhook dispatch. All post-response side effects are fire-and-forget.

## Tasks

- [x] 1. Implement `lib/encryption.ts` — verify AES-256-GCM round-trip
  - The file already exists but uses base64 encoding; verify it matches the design's `iv:authTag:ciphertext` hex format expected by `LLMProviderKey.encryptedApiKey`
  - If format differs, update `encrypt`/`decrypt` to use the colon-separated hex format: `${iv.hex}:${authTag.hex}:${ciphertext.hex}`
  - Export `encrypt(plaintext: string): string` and `decrypt(ciphertext: string): string`
  - Throw `Error("decryption_failed")` on tampered/invalid data
  - _Requirements: 4.1, 4.6, 4.8, 15.2_

  - [x] 1.1 Write property test for encryption round-trip (P5 / P6)
    - **Property 5: Encryption Round-Trip** — `decrypt(encrypt(P)) == P` for all string inputs
    - **Property 6: LLM Provider Key Encryption Round-Trip**
    - Use `fc.string()` to generate arbitrary plaintexts including Unicode
    - File: `tests/unit/encryption.test.ts`
    - **Validates: Requirements 4.1, 4.8**

- [x] 2. Implement `lib/llm/types.ts` — shared gateway types
  - Create `lib/llm/` directory
  - Define `GatewayRequest`, `Message`, `GatewayResponse`, and `ProviderError` as specified in the design
  - `ProviderError` must carry `provider`, `status`, `message`, `retryable: boolean`
  - _Requirements: 23.2, 23.3, 23.5_

- [x] 3. Implement `lib/api-auth.ts` — API key authentication module
  - Export `AuthContext` interface: `{ userId, apiKeyId, scopes, projectId? }`
  - Export `ApiAuthError` class with `code` and `httpStatus` fields
  - Implement `authenticateApiKey(req: NextRequest): Promise<AuthContext>`:
    - Extract Bearer token from `Authorization` header → throw `missing_api_key` (401) if absent
    - Slice `prefix = token.slice(0, 12)`, query `prisma.apiKey.findFirst({ where: { prefix } })`
    - Use `crypto.timingSafeEqual` on SHA-256 digests → throw `invalid_api_key` (401) on mismatch
    - Check `isActive` → throw `api_key_revoked` (401)
    - Check `expiresAt` → throw `api_key_expired` (401)
    - Fire-and-forget: `prisma.apiKey.update({ lastUsedAt, lastUsedIp })` (non-awaited)
    - Return `AuthContext`
  - Implement `requireScope(scopes: string[], required: string): void` → throws `insufficient_scope` (403)
  - Log auth failures to `logAudit` (fire-and-forget) with `resource: "api_key"`, `action: "auth_failed"`
  - Implement brute-force IP blocking: after 10 failures in 5 min from same IP, set Redis key `brute:ip:{ip}` TTL 15 min and log `action: "brute_force_detected"`
  - _Requirements: 2.1–2.12, 3.1–3.7, 15.3, 15.7, 20.3, 21.1–21.6_

  - [x] 3.1 Write property tests for API key auth (P1, P2, P3, P4)
    - **Property 1: API Key Structural Invariants** — format `/^gct_[0-9a-f]{48}$/`, hash match, prefix match
    - **Property 2: Authentication Round-Trip** — create key → authenticate → correct userId/scopes
    - **Property 3: Revocation Correctness** — revoke → authenticate → 401 `api_key_revoked`
    - **Property 4: Scope Enforcement** — random scope sets, verify 403 when scope missing, pass when present
    - File: `tests/unit/api-auth.test.ts`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.11, 1.12, 2.7, 2.11, 2.12, 3.6, 3.7**

- [x] 4. Implement `lib/rate-limiter.ts` — sliding window rate limiter for gateway
  - Create `lib/rate-limiter.ts` (distinct from existing `lib/rate-limit.ts` which handles dashboard endpoints)
  - Implement `slidingWindow(key: string, limit: number, windowMs: number): Promise<RateLimitResult>` using Redis sorted sets:
    - Pipeline: `ZADD key now now` → `ZREMRANGEBYSCORE key 0 (now - windowMs)` → `ZCOUNT key -inf +inf` → `EXPIRE key windowSeconds`
    - Return `{ allowed, limit, remaining, resetAt }`
    - Fail-open: return `{ allowed: true }` if Redis throws
  - Implement `checkRateLimits(apiKeyId: string, projectId: string | undefined, userId: string): Promise<RateLimitResult>`:
    - Check in order: `ratelimit:key:{apiKeyId}:rpm` → `ratelimit:project:{projectId}:rpm` (if projectId) → plan limit via `checkQuota(userId, "requests_per_minute")`
    - Short-circuit on first exceeded limit
    - Return 429 headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
  - _Requirements: 9.1–9.8, 14.1_

  - [x] 4.1 Write property test for rate limit sliding window (P9 / P13)
    - **Property 9: Rate Limit Sliding Window** — N requests allowed, N+1 rejected
    - **Property 13: Rate Limit Sliding Window** (design property)
    - Mock Redis sorted set operations; use `fc.integer({ min: 1, max: 100 })` for limit N
    - File: `tests/unit/rate-limiter.test.ts`
    - **Validates: Requirements 9.7, 9.8**

- [x] 5. Implement `lib/firewall.ts` — Budget Firewall module
  - Export `BudgetCheckResult` interface: `{ allowed, overage?, reason?, scope?, limit?, current?, budgetId? }`
  - Implement `checkBudget(userId: string, projectId?: string, estimatedTokens?: number): Promise<BudgetCheckResult>`:
    - Fetch user `Budget` + project `Budget` in parallel
    - Aggregate `DailyUsageCache` for current calendar month (`date LIKE 'YYYY-MM-%'`) — never query `UsageLog`
    - Call `checkQuota(userId, "tokens_per_month")` for plan-level quota
    - Apply stricter-wins logic: if any source blocks → return `{ allowed: false }`
    - Check `alertThresholdPct` crossing → use Redis `SET NX budget:alert:{scope}:{id}:{YYYY-MM}` for idempotent dispatch
    - If threshold crossed and `notifyOnThreshold = true`: enqueue budget threshold email via BullMQ (fire-and-forget)
    - If hard stop triggered and `notifyOnExceeded = true`: enqueue budget exceeded email (fire-and-forget)
    - Dispatch `"budget.threshold"` or `"budget.exceeded"` webhook via `dispatchWebhook` (fire-and-forget)
    - Log hard stop to `logAudit` with `resource: "budget"`, `action: "hard_stop"` (fire-and-forget)
    - Return `BudgetCheckResult`
  - Implement `recordBudgetUsage(userId: string, projectId: string | undefined, tokens: number, costUsd: number): Promise<void>`:
    - Upsert `DailyUsageCache` on `(userId, projectId, date)`, incrementing `totalTokens`, `totalRequests`, `totalCostUsd`
    - Re-evaluate threshold alerts after update
  - _Requirements: 7.1–7.13, 8.1–8.7, 14.4, 20.4, 22.1–22.8_

  - [x] 5.1 Write property tests for Budget Firewall (P7, P8, P11, P12, P15, P16)
    - **Property 7: Hard Stop Enforcement** — monthly_tokens >= limit and hardStop=true → allowed=false
    - **Property 8: Budget Alert Idempotence** — N crossings → exactly 1 alert dispatched
    - **Property 11: Hard Stop Enforcement** (design property)
    - **Property 12: Budget Alert Idempotence** (design property)
    - **Property 15: Budget Firewall Stricter-Wins** — either budget blocks → checkBudget returns blocked
    - **Property 16: Plan Quota and Budget Firewall Composition**
    - Mock Redis SET NX; use `fc.integer` for token counts and limits
    - File: `tests/unit/firewall.test.ts`
    - **Validates: Requirements 7.2, 7.3, 7.5, 7.6, 7.11, 7.12, 7.13, 22.7, 22.8**

- [x] 6. Implement `lib/llm/openai.ts` — OpenAI adapter
  - Implement `complete(params: GatewayRequest, apiKey: string): Promise<GatewayResponse>`
  - Implement `chat(params: GatewayRequest, apiKey: string): Promise<GatewayResponse>`
  - Read `baseUrl` and `defaultTimeout` from `LLMProviderConfig` (provider `"openai"`) — do not hardcode
  - Translate `GatewayRequest` to OpenAI request shape; translate response back to `GatewayResponse`
  - When `stream: true`: return `ReadableStream` of SSE chunks in OpenAI-compatible format
  - Throw `ProviderError` with `retryable: true` for 5xx/timeout, `retryable: false` for 4xx
  - Record `latencyMs` as time from forward to response receipt
  - _Requirements: 23.1–23.5, 23.8_

- [x] 7. Implement `lib/llm/anthropic.ts` — Anthropic adapter
  - Same interface as OpenAI adapter
  - Translate OpenAI `messages` format to Anthropic's `system` + `messages` format internally
  - Map `role: "system"` messages to Anthropic's `system` parameter
  - _Requirements: 23.1–23.6, 23.8_

- [x] 8. Implement `lib/llm/mistral.ts` — Mistral adapter (update existing if present)
  - Same interface as OpenAI adapter
  - Mistral uses OpenAI-compatible format — minimal translation needed
  - Read `baseUrl` from `LLMProviderConfig` for provider `"mistral"`
  - _Requirements: 23.1–23.5, 23.8_

- [x] 9. Implement `lib/llm/gemini.ts` — Gemini adapter (new)
  - Same interface as OpenAI adapter
  - Translate `messages` array to Google's `contents` format: `{ role: "user"|"model", parts: [{ text }] }`
  - Map `role: "assistant"` → `"model"` for Gemini
  - Read `baseUrl` from `LLMProviderConfig` for provider `"gemini"`
  - _Requirements: 23.1–23.5, 23.7, 23.8_

  - [x] 9.1 Write property test for token sum invariant across all adapters (P9 / P10)
    - **Property 9: Token Sum Invariant** — `totalTokens == promptTokens + completionTokens` for all GatewayResponse objects
    - **Property 10: Token Sum Invariant** (design property)
    - Mock adapter responses with `fc.integer({ min: 0, max: 100_000 })` for token counts
    - File: `tests/unit/adapters.test.ts`
    - **Validates: Requirements 10.10, 23.8**

- [x] 10. Add `ModelCatalog` and `LLMProviderConfig` seed data
  - Create or update `prisma/seed.ts` (or `prisma/seeds/model-catalog.ts`) with seed data for:
    - `LLMProviderConfig`: openai, anthropic, mistral, gemini — with `baseUrl`, `defaultTimeout`, `maxRetries`, `retryDelay`
    - `ModelCatalog`: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`, `claude-3-opus-20240229`, `claude-3-sonnet-20240229`, `claude-3-haiku-20240307`, `mistral-large-latest`, `mistral-small-latest`, `gemini-1.5-pro`, `gemini-1.5-flash`
    - Each model entry must include `inputCostPer1kTokens`, `outputCostPer1kTokens`, `contextWindow`, `maxOutputTokens`, `capabilities`
  - Use upsert to make seed idempotent
  - _Requirements: 18.1–18.5_

- [x] 11. Checkpoint — Ensure foundation libs compile and tests pass
  - Run `pnpm tsc --noEmit` to verify TypeScript
  - Run `pnpm test --run tests/unit/encryption.test.ts tests/unit/api-auth.test.ts tests/unit/rate-limiter.test.ts tests/unit/firewall.test.ts tests/unit/adapters.test.ts`
  - Ask the user if questions arise before proceeding to route handlers

- [x] 12. Update `app/api/v1/api-keys/route.ts` — full CRUD with lifecycle
  - `POST /api/v1/api-keys`: already partially implemented; update to:
    - Support both Clerk session auth and API key auth (use `authenticateApiKey` with Clerk fallback)
    - Validate `scopes` against allowed values: `["complete", "chat", "read", "admin"]`
    - Return HTTP 429 with `{ error: "quota_exceeded" }` when `maxApiKeys` limit reached (already uses `checkQuota`)
    - Dispatch `"api_key.created"` webhook event (fire-and-forget)
    - Log to `logAudit` with `action: "created"` (fire-and-forget)
  - `GET /api/v1/api-keys`: add handler returning all keys for user with `{ id, name, prefix, scopes, projectId, lastUsedAt, isActive, createdAt }` — never `keyHash`
  - `DELETE /api/v1/api-keys/[id]`: add dynamic route handler setting `isActive = false`, dispatching `"api_key.revoked"` webhook, logging audit
  - Add `X-GateCtr-Request-Id` header to all responses
  - _Requirements: 1.1–1.12, 19.4, 19.5, 20.1, 20.2_

- [x] 13. Create `app/api/v1/provider-keys/route.ts` — LLM provider key CRUD
  - `POST /api/v1/provider-keys`: accept `{ provider, apiKey, name }`, validate provider in `["openai", "anthropic", "mistral", "gemini"]`, encrypt `apiKey` via `encrypt()`, store in `LLMProviderKey`
    - Return HTTP 400 for invalid provider, HTTP 409 for duplicate `(userId, provider, name)`
  - `GET /api/v1/provider-keys`: return `{ id, provider, name, isActive, lastUsedAt }` — never the decrypted key
  - `DELETE /api/v1/provider-keys/[id]`: set `isActive = false`
  - Auth: Clerk session only (dashboard operation)
  - _Requirements: 4.1–4.9_

- [x] 14. Create `app/api/v1/budget/route.ts` — Budget configuration API
  - `POST /api/v1/budget`: upsert user-level `Budget` by `userId`; if `projectId` provided, upsert project-level `Budget`
    - Validate `alertThresholdPct` in [1, 99]; validate `maxTokensPerMonth` and `maxCostPerMonth` are positive
    - Return HTTP 403 if `projectId` does not belong to authenticated user
  - `GET /api/v1/budget`: return user-level budget + all project-level budgets for user's projects
  - Auth: Clerk session only
  - _Requirements: 8.1–8.7_

- [x] 15. Create `app/api/v1/models/route.ts` — public model catalog endpoint
  - `GET /api/v1/models`: no authentication required
  - Return active models from `ModelCatalog` joined with `LLMProviderConfig`: `{ modelId, displayName, provider, contextWindow, capabilities }`
  - Filter `isActive = true` on both `ModelCatalog` and `LLMProviderConfig`
  - _Requirements: 18.6_

- [x] 16. Rewrite `app/api/v1/complete/route.ts` — full LLM completion proxy
  - Implement the strict pipeline order per Requirement 13.1:
    1. Parse body; enforce 1 MB size limit → HTTP 413 if exceeded
    2. `authenticateApiKey(req)` — falls back to Clerk session for dashboard requests; catch `ApiAuthError` → return appropriate 401/403
    3. `requireScope(scopes, "complete")`
    4. Resolve model via `prisma.modelCatalog.findUnique({ where: { modelId: body.model } })` → HTTP 400 `unknown_model` if not found or inactive
    5. Check `LLMProviderConfig.isActive` → HTTP 503 `provider_disabled` if false
    6. `checkBudget(userId, projectId)` → HTTP 429 `budget_exceeded` if blocked
    7. `checkRateLimits(apiKeyId, projectId, userId)` → HTTP 429 `rate_limit_exceeded` if exceeded
    8. If `contextOptimizerEnabled`: call `lib/optimizer.ts` optimize function
    9. If `modelRouterEnabled`: call `lib/router.ts` route function
    10. Decrypt provider key via `decrypt(llmProviderKey.encryptedApiKey)`; HTTP 422 `no_provider_key` if none active
    11. Forward to appropriate adapter (`lib/llm/{provider}.ts`) with retry logic per `LLMProviderConfig.maxRetries` / `retryDelay` / `defaultTimeout`
    12. On all retries exhausted: attempt fallback provider; HTTP 502 `provider_unavailable` if no fallback
    13. Return OpenAI-compatible response: `{ id, object: "text_completion", model, choices, usage }`
    14. Set `X-GateCtr-Latency-Ms`, `X-GateCtr-Request-Id`, `X-Content-Type-Options`, `X-Frame-Options` headers
    15. If `overage`: set `X-GateCtr-Overage: true` header
    16. Async (fire-and-forget): `INSERT UsageLog`, `UPSERT DailyUsageCache`, `recordBudgetUsage()`, `dispatchWebhook("request.completed")`
  - Calculate `costUsd = (promptTokens * inputCostPer1kTokens + completionTokens * outputCostPer1kTokens) / 1000`
  - Validate `model` field against injection characters (newlines, null bytes) before use
  - _Requirements: 5.1–5.13, 10.1–10.10, 12.1–12.7, 13.1–13.6, 14.1, 14.7, 15.4–15.6, 15.9, 16.1–16.6_

- [x] 17. Rewrite `app/api/v1/chat/route.ts` — full chat completion proxy
  - Same pipeline as `/complete` with these differences:
    - Accept `{ model, messages, max_tokens?, temperature?, stream?, projectId? }` where `messages` is `{ role, content }[]`
    - `requireScope(scopes, "chat")`
    - Verify model has `"chat"` in `capabilities` → HTTP 400 `model_not_chat_capable` if not
    - Return OpenAI-compatible chat response: `{ id, object: "chat.completion", model, choices: [{ message: { role, content }, finish_reason }], usage }`
    - If `contextOptimizerEnabled`: apply optimizer to `messages` array
  - _Requirements: 6.1–6.10, 10.1–10.10, 12.1–12.7, 13.1–13.6_

  - [x] 17.1 Write property tests for cost calculation and UsageLog invariants (P8, P9, P10, P7)
    - **Property 8: Cost Calculation Correctness** — `costUsd == (promptTokens * inputCost + completionTokens * outputCost) / 1000`
    - **Property 9: Token Sum Invariant** — `totalTokens == promptTokens + completionTokens`
    - **Property 10: Cost Non-Negativity** — `costUsd >= 0`
    - **Property 7: UsageLog Creation Invariant** — count increases by exactly 1 per request
    - Use `fc.float({ min: 0 })` for costs, `fc.integer({ min: 0 })` for tokens
    - File: `tests/unit/cost.test.ts`, `tests/unit/usage-log.test.ts`
    - **Validates: Requirements 5.10, 10.1, 10.2, 10.8, 10.9, 10.10**

  - [x] 17.2 Write property test for OpenAI-compatible response shape (P6)
    - **Property 6: OpenAI-Compatible Response Shape** — response contains `id`, `object`, `model`, `choices`, `usage`
    - Mock LLM adapter; verify shape for both `/complete` and `/chat`
    - File: `tests/unit/complete.test.ts`
    - **Validates: Requirements 5.5, 6.4**

- [x] 18. Update `app/api/v1/usage/summary/route.ts` and create `app/api/v1/usage/route.ts`
  - `GET /api/v1/usage`: aggregate from `DailyUsageCache` (never full `UsageLog` scan):
    - Default: current calendar month
    - `?from=YYYY-MM-DD&to=YYYY-MM-DD`: date range filter
    - `?projectId=`: filter to project (403 if not owned by user)
    - Return `{ totalTokens, totalRequests, totalCostUsd, savedTokens, byModel: [...], byProject: [...], budgetStatus? }`
    - Include `budgetStatus` when a `Budget` record exists
  - Update `GET /api/v1/usage/summary`: keep existing behavior, add `budgetStatus` field
  - Auth: Clerk session or API key with `"read"` scope
  - _Requirements: 11.1–11.7_

- [x] 19. Checkpoint — Ensure all route handlers compile and core pipeline tests pass
  - Run `pnpm tsc --noEmit`
  - Run `pnpm test --run tests/unit/`
  - Ask the user if questions arise before proceeding to integration/E2E tests

- [x] 20. Write unit tests for route handlers and pipeline
  - [x] 20.1 Write unit tests for `lib/api-auth.ts` error paths
    - Test each `ApiAuthError` code: missing header, wrong hash, revoked, expired, insufficient scope
    - Test brute-force blocking logic
    - File: `tests/unit/api-auth.test.ts`
    - _Requirements: 2.2–2.6, 3.4, 15.7_

  - [x] 20.2 Write unit tests for `lib/firewall.ts`
    - Test user-only budget, project-only budget, both budgets, plan quota interaction
    - Test `hardStop = false` → overage flag returned
    - Test `notifyOnThreshold` / `notifyOnExceeded` email dispatch
    - File: `tests/unit/firewall.test.ts`
    - _Requirements: 7.1–7.13_

  - [x] 20.3 Write unit tests for `lib/rate-limiter.ts`
    - Test Redis unavailable → fail-open
    - Test window reset behavior
    - Test order: key limit → project limit → plan limit
    - File: `tests/unit/rate-limiter.test.ts`
    - _Requirements: 9.5, 9.6_

  - [x] 20.4 Write unit tests for `/complete` and `/chat` pipeline
    - Test full pipeline with mocked LLM adapter: auth → budget → rate limit → forward → log
    - Test provider error → 502 response
    - Test streaming response passthrough
    - Test fallback provider logic
    - File: `tests/unit/pipeline.test.ts`
    - _Requirements: 5.1–5.13, 6.1–6.10, 12.1–12.7, 13.1–13.6_

  - [x] 20.5 Write property test for error response format invariant (P13 / P15)
    - **Property 13: Error Response Format Invariant** — all error responses are valid JSON with `error: string`
    - **Property 15: Error Response Format Invariant** (design property)
    - Generate all error conditions; verify `JSON.parse(body)` succeeds and `typeof body.error == "string"`
    - File: `tests/unit/errors.test.ts`
    - **Validates: Requirements 16.1, 16.6**

  - [x] 20.6 Write property test for fallback tracking invariant (P14)
    - **Property 14: Fallback Tracking Invariant** — when fallback provider used, `UsageLog.fallback == true`
    - Mock primary provider failure; verify fallback=true in logged record
    - File: `tests/unit/pipeline.test.ts`
    - **Validates: Requirements 12.3, 12.7**

- [x] 21. Write E2E tests (Playwright)
  - [x] 21.1 Write E2E test: full request flow
    - Create API key → set budget → `POST /api/v1/complete` → verify `UsageLog` created and usage incremented
    - File: `tests/e2e/gateway-flow.spec.ts`
    - _Requirements: 5.1–5.7, 10.1_

  - [x] 21.2 Write E2E test: budget hard stop
    - Set budget with low `maxTokensPerMonth` and `hardStop = true` → exhaust budget → verify 429 response
    - File: `tests/e2e/budget-firewall.spec.ts`
    - _Requirements: 7.2, 7.3_

  - [x] 21.3 Write E2E test: streaming response
    - `POST /api/v1/complete` with `stream: true` → verify SSE chunks received
    - File: `tests/e2e/streaming.spec.ts`
    - _Requirements: 5.8, 6.7_

- [x] 22. Final checkpoint — Ensure all tests pass
  - Run `pnpm test --run`
  - Run `pnpm tsc --noEmit`
  - Ask the user if questions arise before the git task

- [-] 23. Git: commit all changes with conventional commits and create version tag
  - Ensure branch `feat/core-api-budget-firewall` is checked out from `develop`
  - Stage and commit in logical groups using conventional commits:
    - `feat(encryption): verify AES-256-GCM format for LLM provider keys`
    - `feat(llm): add shared gateway types and provider adapters (openai, anthropic, mistral, gemini)`
    - `feat(api-auth): implement API key authentication module with scope enforcement`
    - `feat(rate-limiter): implement sliding window rate limiter for gateway`
    - `feat(firewall): implement budget firewall with hard stop and threshold alerts`
    - `feat(seed): add ModelCatalog and LLMProviderConfig seed data`
    - `feat(api): implement /api/v1/complete and /api/v1/chat LLM proxy endpoints`
    - `feat(api): add /api/v1/provider-keys, /api/v1/budget, /api/v1/models, /api/v1/usage routes`
    - `test(core-api): add property-based and unit tests for gateway pipeline`
    - `test(e2e): add Playwright E2E tests for gateway flow and budget firewall`
  - Create annotated tag: `git tag -a v0.3.0 -m "feat: Core API & Budget Firewall (Phase 3)"`
  - Push branch and tag: `git push origin feat/core-api-budget-firewall && git push origin v0.3.0`
  - _Requirements: all_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints (tasks 11, 19, 22) ensure incremental validation before proceeding
- Property tests use `fast-check` (already in `devDependencies`) with minimum 100 iterations
- `lib/rate-limiter.ts` is a new file — distinct from the existing `lib/rate-limit.ts` (dashboard rate limiting)
- `lib/encryption.ts` already exists; task 1 verifies/aligns its format with the design spec
- `lib/plan-guard.ts` already exists and is used as-is by the firewall and rate limiter
- All post-response side effects (UsageLog, DailyUsageCache, webhooks, emails) are fire-and-forget
- Redis fail-open: rate limiter and plan cache never reject requests due to Redis unavailability
