# Implementation Plan: API Logic Completion

## Overview

Implement all missing `app/api/v1/` route handlers following the established auth/ownership/audit/webhook pattern. Routes are grouped by domain and built incrementally so each step is independently testable.

## Tasks

- [x] 1. Extract shared pure helpers into lib utilities
  - [x] 1.1 Create `lib/health-utils.ts` with `computeOverallStatus(statuses: string[]): string` pure function
    - Returns `"down"` if any status is `"DOWN"`, `"degraded"` if any is `"DEGRADED"`, otherwise `"healthy"`
    - _Requirements: 9.3_
  - [x] 1.2 Write property test for `computeOverallStatus` (Property 19)
    - **Property 19: System health overall status computation**
    - **Validates: Requirements 9.3**
    - Use `fc.array(fc.constantFrom("HEALTHY", "DEGRADED", "DOWN"), { minLength: 1 })`
    - File: `tests/unit/api/system-health-status.test.ts`
  - [x] 1.3 Create `lib/cache-utils.ts` with `computeEstimatedTokensSaved(entries: { promptTokens: number; hitCount: number }[]): number` pure function
    - Returns sum of `promptTokens * hitCount` across all entries
    - _Requirements: 8.4_
  - [x] 1.4 Write property test for `computeEstimatedTokensSaved` (Property 18)
    - **Property 18: estimatedTokensSaved formula correctness**
    - **Validates: Requirements 8.4**
    - Use `fc.array(fc.record({ promptTokens: fc.nat(), hitCount: fc.nat() }))`
    - File: `tests/unit/api/cache-stats-formula.test.ts`

- [x] 2. Implement project detail, update, and delete (`app/api/v1/projects/[id]/route.ts`)
  - Create `app/api/v1/projects/[id]/route.ts` with GET, PATCH, DELETE handlers
  - GET: auth guard → ownership check (403 if not owned) → return project record
  - PATCH: auth guard → ownership check → `prisma.project.update` with only provided fields → `logAudit` (resource: "project", action: "updated", oldValue, newValue) → `dispatchWebhook("project.updated")` → return updated project
  - DELETE: auth guard → ownership check → `prisma.project.delete` → `logAudit` (resource: "project", action: "deleted") → `dispatchWebhook("project.deleted")` → return `{ success: true }`
  - All responses include `X-GateCtr-Request-Id` header (8-byte hex via `randomBytes(8).toString("hex")`)
  - Wrap all handlers in try/catch returning `{ error: "internal_error" }` on 500
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 10.1, 10.2, 10.5, 10.6_
  - [x] 2.1 Write property test for ownership guard (Property 1)
    - **Property 1: Ownership guard blocks non-owners**
    - **Validates: Requirements 1.2**
    - Mock Prisma to return a project with a different `userId`; assert 403
    - File: `tests/unit/api/ownership-guard.test.ts`
  - [x] 2.2 Write property test for partial update (Property 3)
    - **Property 3: Partial update preserves unmodified fields**
    - **Validates: Requirements 1.3**
    - Use `fc.record` with optional fields via `fc.option`; verify only provided fields change
    - File: `tests/unit/api/projects-patch.test.ts`
  - [x] 2.3 Write property test for audit log emission (Property 4)
    - **Property 4: Mutating operations emit audit log entries**
    - **Validates: Requirements 1.5, 1.6**
    - Mock `logAudit`; assert called with correct `resource`, `action`, `oldValue`, `newValue`
    - File: `tests/unit/api/audit-emission.test.ts`
  - [x] 2.4 Write property test for webhook dispatch (Property 5)
    - **Property 5: Webhook-triggering operations dispatch the correct event**
    - **Validates: Requirements 1.7**
    - Mock `dispatchWebhook`; assert called with `"project.updated"` / `"project.deleted"`
    - File: `tests/unit/api/webhook-dispatch.test.ts`
  - [x] 2.5 Write property test for X-GateCtr-Request-Id header (Property 6)
    - **Property 6: All responses include X-GateCtr-Request-Id header**
    - **Validates: Requirements 1.8, 10.5**
    - Assert header present and matches `/^[0-9a-f]{16}$/`
    - File: `tests/unit/api/request-id-header.test.ts`

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement alert rules CRUD and alert history
  - [x] 4.1 Create `app/api/v1/alerts/route.ts` with GET, POST, DELETE handlers
    - GET: auth guard → `prisma.alertRule.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })`
    - POST: auth guard → validate `name`, `alertType`, `condition` present (400 `"validation_error"`) → validate `alertType` ∈ `{budget_threshold, token_limit, error_rate, latency}` (400 `"invalid_alert_type"`) → create record → `logAudit` (resource: "alert_rule", action: "created") → return 201
    - DELETE: auth guard → ownership check on `AlertRule.userId` (403) → delete → `logAudit` (resource: "alert_rule", action: "deleted")
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8_
  - [x] 4.2 Write property test for alert ordering (Property 7)
    - **Property 7: Alert rules list is ordered by createdAt descending**
    - **Validates: Requirements 2.1**
    - Use `fc.array(fc.record({ createdAt: fc.date() }), { minLength: 1 })`
    - File: `tests/unit/api/alerts-ordering.test.ts`
  - [x] 4.3 Write property test for input validation (Property 2)
    - **Property 2: Input validation rejects invalid enum values and missing fields**
    - **Validates: Requirements 2.3, 2.4**
    - Use `fc.string()` for `alertType` filtered to values outside the allowed set
    - File: `tests/unit/api/input-validation.test.ts`
  - [x] 4.4 Create `app/api/v1/alerts/[id]/history/route.ts` with GET handler
    - Auth guard → find `AlertRule` by `id` → ownership check (`AlertRule.userId === dbUser.id`, 403) → return `prisma.alert.findMany({ where: { ruleId: id }, orderBy: { createdAt: "desc" } })`
    - _Requirements: 2.7_

- [x] 5. Implement team invitations
  - [x] 5.1 Create `app/api/v1/teams/invitations/route.ts` with POST handler
    - Auth guard → verify `Team.ownerId === dbUser.id` (403) → check for existing `TeamInvitation` with same `[teamId, email]` (409 `"invitation_already_exists"`) → generate token via `randomBytes(32).toString("hex")` and `expiresAt = now + 7 days` → create record → return 201
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 5.2 Write property test for invitation token uniqueness and expiry (Property 8)
    - **Property 8: Team invitation token is unique and expires in 7 days**
    - **Validates: Requirements 3.1**
    - Assert token length === 64 and `expiresAt` within ±1 second of `now + 7 days`
    - File: `tests/unit/api/invitation-token.test.ts`
  - [x] 5.3 Write property test for duplicate invitation (Property 9)
    - **Property 9: Duplicate invitation returns 409**
    - **Validates: Requirements 3.3**
    - Mock Prisma unique constraint error; assert 409 with `"invitation_already_exists"`
    - File: `tests/unit/api/invitation-duplicate.test.ts`
  - [x] 5.4 Create `app/api/v1/teams/invitations/[token]/route.ts` with GET handler (no auth)
    - Find `TeamInvitation` by token including `team.name` → if not found or `expiresAt < now` return 404 → return invitation + team name
    - _Requirements: 3.4, 3.5_
  - [x] 5.5 Write property test for invitation round-trip (Property 10)
    - **Property 10: Invitation fetch by token is a round-trip**
    - **Validates: Requirements 3.4**
    - Mock Prisma findUnique; assert response includes `team.name` and no auth required
    - File: `tests/unit/api/invitation-roundtrip.test.ts`
  - [x] 5.6 Create `app/api/v1/teams/invitations/[token]/accept/route.ts` with POST handler
    - Auth guard → find invitation by token → if `acceptedAt` not null return 409 `"invitation_already_accepted"` → if `expiresAt < now` return 410 `"invitation_expired"` → `prisma.teamMember.create` with invitation role → `prisma.teamInvitation.update({ acceptedAt: new Date() })` → `logAudit` (resource: "team_invitation", action: "accepted") → `dispatchWebhook("team.member.added")` → return `{ success: true }`
    - _Requirements: 3.6, 3.7, 3.8, 3.9, 3.10_
  - [x] 5.7 Write property test for accept invitation (Property 11)
    - **Property 11: Accepting an invitation creates a TeamMember and sets acceptedAt**
    - **Validates: Requirements 3.6**
    - Mock Prisma; assert `teamMember.create` called and `acceptedAt` set to non-null
    - File: `tests/unit/api/invitation-accept.test.ts`
  - [x] 5.8 Write property test for already-accepted invitation (Property 12)
    - **Property 12: Already-accepted invitation returns 409**
    - **Validates: Requirements 3.7**
    - Mock invitation with `acceptedAt` set; assert 409 with `"invitation_already_accepted"`
    - File: `tests/unit/api/invitation-already-accepted.test.ts`

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement project-scoped usage (`app/api/v1/projects/[id]/usage/route.ts`)
  - Create `app/api/v1/projects/[id]/usage/route.ts` with GET handler
  - Auth guard → ownership check on project (403) → parse `from`/`to` query params (default: current calendar month) → parallel queries: `DailyUsageCache` aggregate totals, `DailyUsageCache` findMany for `byDate`, `Budget.findUnique({ where: { projectId } })`, and `UsageLog.groupBy` for `byModel` if `checkFeatureAccess(userId, "advancedAnalytics")` → return combined response
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 8. Implement integration connectors CRUD (`app/api/v1/integrations/route.ts`)
  - [x] 8.1 Create `app/api/v1/integrations/route.ts` with GET, POST, DELETE handlers
    - GET: auth guard → `prisma.integrationConnector.findMany({ where: { userId }, select: { ..., encryptedConfig: false } })` — omit `encryptedConfig` from response
    - POST: auth guard → validate `name`, `type`, `config` present (400 `"validation_error"`) → validate `type` ∈ `{slack, teams, discord, zapier, custom}` (400 `"invalid_integration_type"`) → `encrypt(JSON.stringify(config))` → create record → check unique constraint violation → 409 `"integration_already_exists"` → `logAudit` (resource: "integration", action: "created") → return 201
    - DELETE: auth guard → ownership check (403) → delete → `logAudit` (resource: "integration", action: "deleted")
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_
  - [x] 8.2 Write property test for GET omits encryptedConfig (Property 13)
    - **Property 13: Integration GET response never includes encryptedConfig**
    - **Validates: Requirements 5.1**
    - Assert response objects do not contain `encryptedConfig` key
    - File: `tests/unit/api/integrations-get.test.ts`
  - [x] 8.3 Write property test for encryption round-trip (Property 14)
    - **Property 14: Integration config encryption round-trip**
    - **Validates: Requirements 5.2**
    - Use `fc.string()` for config values; assert `decrypt(encryptedConfig)` equals `JSON.stringify(config)`
    - File: `tests/unit/encryption.test.ts`
  - [x] 8.4 Write property test for duplicate integration (Property 15)
    - **Property 15: Duplicate integration returns 409**
    - **Validates: Requirements 5.5**
    - Mock Prisma unique constraint error; assert 409 with `"integration_already_exists"`
    - File: `tests/unit/api/integration-duplicate.test.ts`

- [x] 9. Implement team member role update (`app/api/v1/teams/members/[memberId]/role/route.ts`)
  - Create `app/api/v1/teams/members/[memberId]/role/route.ts` with PATCH handler
  - Auth guard → find `TeamMember` by `memberId` (404 if not found) → find team → verify `Team.ownerId === dbUser.id` (403) → validate `role` ∈ `{ADMIN, MEMBER, VIEWER}` (400 `"invalid_role"`) → prevent owner changing own role (400 `"cannot_change_owner_role"`) → `prisma.teamMember.update` → `logAudit` (resource: "team_member", action: "role.updated", oldValue, newValue) → `dispatchWebhook("team.member.role_updated")` → return updated member
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement optimization rules management
  - [x] 11.1 Create `app/api/v1/optimization-rules/route.ts` with GET and POST handlers
    - GET: auth guard → `prisma.optimizationRule.findMany({ where: { isActive: true }, orderBy: { priority: "desc" } })`
    - POST: auth guard → validate `name` and `ruleType` present (400 `"validation_error"`) → validate `ruleType` ∈ `{compression, rewrite, pruning}` (400 `"invalid_rule_type"`) → create record → return 201
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 11.2 Write property test for active rules ordering (Property 16)
    - **Property 16: Optimization rules list contains only active rules ordered by priority**
    - **Validates: Requirements 7.1**
    - Use `fc.array` with mixed `isActive` and `priority` values; assert only active rules returned in descending priority order
    - File: `tests/unit/api/optimization-rules.test.ts`
  - [x] 11.3 Create `app/api/v1/optimization-rules/[id]/route.ts` with PATCH and DELETE handlers
    - PATCH: auth guard → find rule (404 if not found) → update provided fields from `{ name, description, pattern, replacement, priority, isActive }` → return updated rule
    - DELETE: auth guard → find rule (404 if not found) → delete → return `{ success: true }`
    - _Requirements: 7.4, 7.5, 7.6_

- [x] 12. Implement cache statistics (`app/api/v1/cache/stats/route.ts`)
  - Create `app/api/v1/cache/stats/route.ts` with GET handler
  - Auth guard → `const now = new Date(); const where = { expiresAt: { gt: now } }` → parallel: `prisma.cacheEntry.count({ where })`, `prisma.cacheEntry.aggregate({ where, _sum: { hitCount: true } })`, `prisma.cacheEntry.groupBy({ by: ["model", "provider"], where, _sum: { hitCount: true, promptTokens: true }, _count: { id: true }, orderBy: { _sum: { hitCount: "desc" } }, take: 10 })` → compute `estimatedTokensSaved` via `computeEstimatedTokensSaved` from `lib/cache-utils.ts` → return `{ totalEntries, totalHits, topModels, estimatedTokensSaved }`
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [x] 12.1 Write property test for cache stats expiry filter (Property 17)
    - **Property 17: Cache stats exclude expired entries**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
    - Mix expired/non-expired entries; assert all stats computed only from non-expired entries
    - File: `tests/unit/api/cache-stats.test.ts`

- [x] 13. Implement system health endpoint (`app/api/v1/system/health/route.ts`)
  - Create `app/api/v1/system/health/route.ts` with GET handler (no auth required)
  - `const SERVICES = ["app", "database", "redis", "queue", "stripe"] as const` → `Promise.all` of `prisma.systemHealth.findFirst({ where: { service }, orderBy: { checkedAt: "desc" } })` for each → map to `{ status, checkedAt }` (null record → `{ status: "unknown", checkedAt: null }`) → compute overall status via `computeOverallStatus` from `lib/health-utils.ts` → return `{ status, services, X-GateCtr-Request-Id }`
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [x] 13.1 Write property test for latest health per service (Property 20)
    - **Property 20: System health returns latest record per service**
    - **Validates: Requirements 9.1**
    - Mock multiple records per service at different timestamps; assert most recent `checkedAt` is returned
    - File: `tests/unit/api/system-health-latest.test.ts`

- [x] 14. Implement cross-cutting auth and error handling tests
  - [x] 14.1 Write property test for 401 on missing auth (Property 21)
    - **Property 21: Unauthenticated requests to protected endpoints return 401**
    - **Validates: Requirements 10.1, 10.2**
    - Mock `auth()` to return `{ userId: null }`; assert 401 with `{ error: "Unauthorized" }` across all protected handlers
    - File: `tests/unit/api/auth-guard.test.ts`
  - [x] 14.2 Write property test for 500 without stack trace (Property 22)
    - **Property 22: Unhandled exceptions return 500 without stack traces**
    - **Validates: Requirements 10.6**
    - Mock Prisma to throw; assert 500 with `{ error: "internal_error" }` and response body does not contain stack trace string
    - File: `tests/unit/api/error-handling.test.ts`

- [x] 15. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests use **fast-check** (`pnpm add -D fast-check`); each runs a minimum of 100 iterations
- Tag format for each property test: `// Feature: api-logic-completion, Property N: <property_text>`
- All route handlers follow the auth guard pattern from `app/api/v1/projects/route.ts`
- `logAudit` and `dispatchWebhook` are always called with `.catch(() => {})` — never break the main response flow
- `encrypt` from `lib/encryption.ts` is used for `IntegrationConnector.encryptedConfig`
- `checkFeatureAccess(userId, "advancedAnalytics")` gates the `byModel` breakdown in project usage
