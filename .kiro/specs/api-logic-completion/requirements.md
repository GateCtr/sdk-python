# Requirements Document

## Introduction

GateCtr has a complete Prisma schema with models for projects, alerts, team invitations, project-scoped usage, integrations, team member roles, optimization rules, cache stats, and system health — but the corresponding API route handlers do not yet exist. This feature implements all missing API routes across three priority tiers (HIGH, MEDIUM, LOW), following the established patterns: Clerk auth, DB user lookup, ownership checks (403), quota guards, audit logging, and webhook dispatch.

## Glossary

- **API_Router**: The Next.js App Router handler layer at `app/api/v1/`
- **Auth_Guard**: The Clerk-based authentication check (`auth()` → `clerkId` → DB user lookup)
- **Ownership_Guard**: The check that a resource belongs to the authenticated user; returns 403 on failure
- **Quota_Guard**: The `checkQuota()` call from `lib/plan-guard` that enforces plan limits
- **Audit_Logger**: The `logAudit()` function from `lib/audit`
- **Webhook_Dispatcher**: The `dispatchWebhook()` function from `lib/webhooks`
- **Encryptor**: The `encrypt()` / `decrypt()` functions from `lib/encryption`
- **Project**: A `Project` record scoped to a user (and optionally a team)
- **AlertRule**: A monitoring rule with type, condition JSON, channels, and active flag
- **Alert**: A fired alert instance linked to an `AlertRule`
- **TeamInvitation**: A pending invitation record with a unique token and 7-day expiry
- **TeamMember**: A user–team association with a role
- **IntegrationConnector**: A third-party integration record with AES-encrypted config
- **OptimizationRule**: A prompt compression/rewrite rule managed by admins
- **CacheEntry**: A cached LLM response record with hit tracking
- **SystemHealth**: A per-service health snapshot record

---

## Requirements

### Requirement 1: Project Detail, Update, and Delete

**User Story:** As a developer, I want to retrieve, update, and delete individual projects, so that I can manage project metadata and lifecycle without losing related data.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/v1/projects/[id]`, THE API_Router SHALL return the full project record if the authenticated user owns it.
2. IF the project does not exist or is not owned by the authenticated user, THEN THE API_Router SHALL return a 403 response.
3. WHEN a PATCH request is made to `/api/v1/projects/[id]` with a body containing any of `name`, `description`, `color`, or `isActive`, THE API_Router SHALL update only the provided fields and return the updated project.
4. WHEN a DELETE request is made to `/api/v1/projects/[id]`, THE API_Router SHALL delete the project and cascade-delete its associated `UsageLog`, `Budget`, and `ApiKey` records via Prisma's `onDelete: Cascade` relations.
5. WHEN a project is updated via PATCH, THE Audit_Logger SHALL record the action with `resource: "project"`, `action: "updated"`, `oldValue`, and `newValue`.
6. WHEN a project is deleted via DELETE, THE Audit_Logger SHALL record the action with `resource: "project"`, `action: "deleted"`.
7. WHEN a project is updated or deleted, THE Webhook_Dispatcher SHALL fire `project.updated` or `project.deleted` respectively.
8. THE API_Router SHALL include an `X-GateCtr-Request-Id` header on all responses from these endpoints.

---

### Requirement 2: Alert Rules CRUD and Alert History

**User Story:** As a developer, I want to create, list, and delete alert rules, and view the history of fired alerts for a rule, so that I can monitor budget thresholds, token limits, error rates, and latency.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/v1/alerts`, THE API_Router SHALL return all `AlertRule` records belonging to the authenticated user, ordered by `createdAt` descending.
2. WHEN a POST request is made to `/api/v1/alerts` with `name`, `alertType`, and `condition`, THE API_Router SHALL create an `AlertRule` record linked to the authenticated user.
3. IF `alertType` is not one of `budget_threshold`, `token_limit`, `error_rate`, or `latency`, THEN THE API_Router SHALL return a 400 response with `error: "invalid_alert_type"`.
4. IF `name` or `alertType` or `condition` is missing from the POST body, THEN THE API_Router SHALL return a 400 response with `error: "validation_error"`.
5. WHEN a DELETE request is made to `/api/v1/alerts` with an `id` in the body, THE API_Router SHALL delete the `AlertRule` if it belongs to the authenticated user.
6. IF the `AlertRule` to delete does not belong to the authenticated user, THEN THE API_Router SHALL return a 403 response.
7. WHEN a GET request is made to `/api/v1/alerts/[id]/history`, THE API_Router SHALL return all `Alert` records for the given `AlertRule`, ordered by `createdAt` descending, if the rule belongs to the authenticated user.
8. WHEN an `AlertRule` is created or deleted, THE Audit_Logger SHALL record the action with `resource: "alert_rule"` and the corresponding action string.

---

### Requirement 3: Team Invitations

**User Story:** As a team owner, I want to invite users by email, retrieve an invitation by token, and allow invitees to accept invitations, so that I can grow my team without requiring manual user creation.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/v1/teams/invitations` with `teamId`, `email`, and `role`, THE API_Router SHALL create a `TeamInvitation` record with a cryptographically random token and `expiresAt` set to 7 days from creation.
2. IF the authenticated user is not the owner of the specified team, THEN THE API_Router SHALL return a 403 response.
3. IF a `TeamInvitation` already exists for the same `teamId` and `email`, THEN THE API_Router SHALL return a 409 response with `error: "invitation_already_exists"`.
4. WHEN a GET request is made to `/api/v1/teams/invitations/[token]`, THE API_Router SHALL return the invitation record (including team name) without requiring authentication.
5. IF the invitation token does not exist or has expired (`expiresAt < now`), THEN THE API_Router SHALL return a 404 response.
6. WHEN a POST request is made to `/api/v1/teams/invitations/[token]/accept` by an authenticated user, THE API_Router SHALL create a `TeamMember` record with the invitation's role and set `acceptedAt` on the invitation.
7. IF the invitation has already been accepted (`acceptedAt` is not null), THEN THE API_Router SHALL return a 409 response with `error: "invitation_already_accepted"`.
8. IF the invitation has expired at the time of acceptance, THEN THE API_Router SHALL return a 410 response with `error: "invitation_expired"`.
9. WHEN an invitation is accepted, THE Audit_Logger SHALL record the action with `resource: "team_invitation"`, `action: "accepted"`, and `resourceId` set to the team ID.
10. WHEN an invitation is accepted, THE Webhook_Dispatcher SHALL fire `team.member.added` with the team ID, new member ID, and role.

---

### Requirement 4: Project-Scoped Usage

**User Story:** As a developer, I want to retrieve aggregated usage data scoped to a specific project, so that I can analyze token consumption and costs per project with date range filtering.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/v1/projects/[id]/usage`, THE API_Router SHALL return aggregated usage totals (`totalTokens`, `totalRequests`, `totalCostUsd`, `savedTokens`) for the specified project within the requested date range.
2. IF no `from` or `to` query parameters are provided, THE API_Router SHALL default to the current calendar month.
3. IF the project does not exist or is not owned by the authenticated user, THEN THE API_Router SHALL return a 403 response.
4. THE API_Router SHALL include a `byDate` breakdown (daily aggregates from `DailyUsageCache`) in the response.
5. THE API_Router SHALL include the project's `Budget` record in the response if one exists.
6. WHERE the user's plan includes `advancedAnalytics`, THE API_Router SHALL include a `byModel` breakdown grouped by model and provider.

---

### Requirement 5: Integration Connectors CRUD

**User Story:** As a developer, I want to create, list, and delete integration connectors for Slack, Teams, Discord, Zapier, and custom endpoints, so that I can route GateCtr events to external systems.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/v1/integrations`, THE API_Router SHALL return all `IntegrationConnector` records for the authenticated user, with `encryptedConfig` omitted from the response.
2. WHEN a POST request is made to `/api/v1/integrations` with `type`, `name`, and `config`, THE Encryptor SHALL encrypt the `config` object before storing it as `encryptedConfig` in the `IntegrationConnector` record.
3. IF `type` is not one of `slack`, `teams`, `discord`, `zapier`, or `custom`, THEN THE API_Router SHALL return a 400 response with `error: "invalid_integration_type"`.
4. IF `name` or `type` or `config` is missing from the POST body, THEN THE API_Router SHALL return a 400 response with `error: "validation_error"`.
5. IF an `IntegrationConnector` already exists for the same `userId`, `type`, and `name`, THEN THE API_Router SHALL return a 409 response with `error: "integration_already_exists"`.
6. WHEN a DELETE request is made to `/api/v1/integrations` with an `id` in the body, THE API_Router SHALL delete the `IntegrationConnector` if it belongs to the authenticated user.
7. IF the `IntegrationConnector` to delete does not belong to the authenticated user, THEN THE API_Router SHALL return a 403 response.
8. WHEN an integration is created or deleted, THE Audit_Logger SHALL record the action with `resource: "integration"` and the corresponding action string.

---

### Requirement 6: Team Member Role Update

**User Story:** As a team owner, I want to update a team member's role, so that I can manage access levels within my team.

#### Acceptance Criteria

1. WHEN a PATCH request is made to `/api/v1/teams/members/[memberId]/role` with a `role` field, THE API_Router SHALL update the `TeamMember` record's role to the new value.
2. IF the authenticated user is not the owner of the team that the member belongs to, THEN THE API_Router SHALL return a 403 response.
3. IF `role` is not one of `ADMIN`, `MEMBER`, or `VIEWER`, THEN THE API_Router SHALL return a 400 response with `error: "invalid_role"`.
4. IF the target `TeamMember` record does not exist, THEN THE API_Router SHALL return a 404 response.
5. THE API_Router SHALL prevent the owner from changing their own role via this endpoint, returning a 400 response with `error: "cannot_change_owner_role"`.
6. WHEN a role is updated, THE Audit_Logger SHALL record the action with `resource: "team_member"`, `action: "role.updated"`, `oldValue`, and `newValue`.
7. WHEN a role is updated, THE Webhook_Dispatcher SHALL fire `team.member.role_updated` with the team ID, member ID, old role, and new role.

---

### Requirement 7: Optimization Rules Management

**User Story:** As a developer, I want to list active optimization rules, and as an admin, I want to create, update, and delete them, so that prompt compression and rewriting can be configured dynamically.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/v1/optimization-rules`, THE API_Router SHALL return all `OptimizationRule` records where `isActive` is true, ordered by `priority` descending.
2. WHEN a POST request is made to `/api/v1/optimization-rules` with `name` and `ruleType`, THE API_Router SHALL create a new `OptimizationRule` record.
3. IF `ruleType` is not one of `compression`, `rewrite`, or `pruning`, THEN THE API_Router SHALL return a 400 response with `error: "invalid_rule_type"`.
4. WHEN a PATCH request is made to `/api/v1/optimization-rules/[id]`, THE API_Router SHALL update the provided fields (`name`, `description`, `pattern`, `replacement`, `priority`, `isActive`) on the matching record.
5. WHEN a DELETE request is made to `/api/v1/optimization-rules/[id]`, THE API_Router SHALL delete the matching `OptimizationRule` record.
6. IF the `OptimizationRule` to update or delete does not exist, THEN THE API_Router SHALL return a 404 response.

---

### Requirement 8: Cache Statistics

**User Story:** As a developer, I want to view cache statistics including total entries, total hits, top models by hit count, and estimated tokens saved, so that I can evaluate the effectiveness of the LLM response cache.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/v1/cache/stats`, THE API_Router SHALL return `totalEntries` (count of all non-expired `CacheEntry` records) for the authenticated user's usage scope.
2. THE API_Router SHALL return `totalHits` (sum of `hitCount` across all non-expired entries).
3. THE API_Router SHALL return `topModels` as an array of `{ model, provider, hitCount, entriesCount }` objects, ordered by `hitCount` descending, limited to 10.
4. THE API_Router SHALL return `estimatedTokensSaved` calculated as the sum of `(promptTokens * hitCount)` across all non-expired entries.
5. THE API_Router SHALL filter out expired entries (`expiresAt < now`) from all calculations.

---

### Requirement 9: System Health

**User Story:** As an operator, I want to retrieve the latest health status for each service (app, database, redis, queue, stripe), so that I can monitor platform availability without authentication.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/v1/system/health`, THE API_Router SHALL return the latest `SystemHealth` record for each of the five services: `app`, `database`, `redis`, `queue`, and `stripe`.
2. THE API_Router SHALL NOT require authentication for this endpoint.
3. THE API_Router SHALL return an overall `status` field set to `"healthy"` if all services are `HEALTHY`, `"degraded"` if any service is `DEGRADED`, and `"down"` if any service is `DOWN`.
4. THE API_Router SHALL include a `checkedAt` timestamp for each service entry.
5. IF no `SystemHealth` record exists for a service, THE API_Router SHALL return `{ status: "unknown", checkedAt: null }` for that service.
6. THE API_Router SHALL include an `X-GateCtr-Request-Id` header on all responses.

---

### Requirement 10: Cross-Cutting Auth and Error Handling

**User Story:** As a platform operator, I want all protected API routes to enforce consistent authentication, ownership checks, and error shapes, so that the API surface is predictable and secure.

#### Acceptance Criteria

1. THE Auth_Guard SHALL be applied to all endpoints in Requirements 1–8 before any business logic executes.
2. IF the Clerk session is missing or invalid, THEN THE API_Router SHALL return a 401 response with `{ error: "Unauthorized" }`.
3. IF the DB user record is not found for a valid Clerk session, THEN THE API_Router SHALL return a 404 response with `{ error: "User not found" }`.
4. THE Ownership_Guard SHALL be applied to all resource-specific endpoints before mutation or deletion.
5. THE API_Router SHALL include an `X-GateCtr-Request-Id` header (random 8-byte hex) on all responses.
6. IF an unhandled exception occurs, THEN THE API_Router SHALL return a 500 response with `{ error: "internal_error" }` and SHALL NOT expose stack traces.
