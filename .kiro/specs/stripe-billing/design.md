# Design Document — stripe-billing

## Overview

This document describes the technical design for Phase 2 of GateCtr: Stripe billing and plan management. The feature adds a complete subscription lifecycle to the platform — from checkout through webhook processing to quota enforcement — while exposing a self-service billing dashboard to users.

GateCtr charges a flat subscription for the control layer (not per token). Plans are FREE, PRO (€29/mo), TEAM (€99/mo), and ENTERPRISE (custom). The system integrates Stripe Checkout and the Stripe Billing Portal, processes lifecycle webhooks idempotently, enforces per-plan quotas on every API request via a Redis-backed plan guard, and renders a localized billing dashboard in the Next.js App Router.

### Key Design Principles

- **Server-side only**: All Stripe API calls happen in Next.js Route Handlers or Server Components. No Stripe secret key is ever sent to the browser.
- **Idempotent webhooks**: Every Stripe event is recorded in `StripeEvent` before processing; duplicate deliveries are silently acknowledged.
- **Cache-first quota enforcement**: `PlanLimit` records are cached in Redis (TTL 300 s) to avoid a DB round-trip on every API request.
- **Graceful downgrade**: Canceling a subscription downgrades the user to FREE but never auto-deletes resources; the billing page surfaces over-limit warnings.

---

## Architecture

```mermaid
graph TD
    subgraph Browser
        BP[Billing Page<br/>app/[locale]/(dashboard)/billing]
        PC[PlanCard component]
        UB[UsageBar component]
    end

    subgraph Next.js Server
        CO[POST /api/billing/checkout]
        PO[POST /api/billing/portal]
        WH[POST /api/webhooks/stripe]
        PG[lib/plan-guard.ts]
        SC[lib/stripe.ts]
    end

    subgraph External
        ST[(Stripe)]
        DB[(PostgreSQL / Prisma)]
        RD[(Upstash Redis)]
    end

    BP -->|POST planId| CO
    BP -->|POST| PO
    CO --> SC
    PO --> SC
    SC --> ST
    ST -->|webhook events| WH
    WH --> DB
    WH --> RD
    PG --> DB
    PG --> RD
    BP -->|server fetch| DB
```

### Request Flow — Checkout

1. User clicks "Upgrade to Pro" on the billing page.
2. Browser POSTs `{ planId }` to `/api/billing/checkout`.
3. Route handler authenticates via `auth()` (Clerk), looks up or creates a Stripe customer, creates a Checkout Session, returns `{ url }`.
4. Browser redirects to Stripe-hosted checkout.
5. On success, Stripe fires `checkout.session.completed` to the webhook handler.
6. Webhook handler updates `Subscription` + `User.plan` in DB, invalidates Redis cache.

### Request Flow — Quota Check

1. Incoming API request hits a route handler.
2. Route handler calls `checkQuota(userId, type)` from `lib/plan-guard.ts`.
3. Plan guard reads `PlanLimit` from Redis (or DB on cache miss), checks usage from `DailyUsageCache` or Redis rate limiter.
4. Returns `{ allowed: boolean, ... }`. If `allowed: false`, route handler returns HTTP 429.

---

## Components and Interfaces

### lib/stripe.ts

Singleton Stripe client. Throws at module load time if `STRIPE_SECRET_KEY` is absent.

```typescript
import Stripe from 'stripe';
if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-02-25.clover',
});
```

```typescript
// POST { planId: string, interval?: 'monthly' | 'yearly' }
// Returns { url: string } | error
export async function POST(req: NextRequest): Promise<NextResponse>
```

Logic:
1. `auth()` → userId, or return 401.
2. Fetch user email from DB (`prisma.user.findUnique`).
3. Fetch `Subscription` for userId to get existing `stripeCustomerId`.
4. If subscription status is ACTIVE → return 409.
5. If no `stripeCustomerId` → `stripe.customers.create({ email })` → upsert `Subscription`.
6. Fetch `Plan` by `planId`; resolve price ID based on `interval` (`stripePriceIdMonthly` or `stripePriceIdYearly`); if null → return 400.
7. `stripe.checkout.sessions.create(...)` with `client_reference_id: userId`.
8. Return `{ url: session.url }`.

### app/api/billing/portal/route.ts

```typescript
// POST (no body required)
// Returns { url: string } | error
export async function POST(req: NextRequest): Promise<NextResponse>
```

Logic:
1. `auth()` → userId, or return 401.
2. Fetch `Subscription` for userId → get `stripeCustomerId`.
3. If no `stripeCustomerId` → return 400.
4. `stripe.billingPortal.sessions.create({ customer, return_url })`.
5. Return `{ url: session.url }`.

### app/api/webhooks/stripe/route.ts

```typescript
// POST (raw body)
// Returns 200 | 400 | 500
export async function POST(req: NextRequest): Promise<NextResponse>
```

Must use `await req.text()` for raw body (required by Stripe signature verification). The route must be excluded from Next.js body parsing — this is automatic for Route Handlers using `req.text()`.

Handled events:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.payment_succeeded`

### lib/plan-guard.ts

```typescript
export type QuotaType =
  | 'tokens_per_day'
  | 'tokens_per_month'
  | 'requests_per_minute'
  | 'projects'
  | 'api_keys'
  | 'webhooks'
  | 'team_members';

export type FeatureFlag = 'contextOptimizer' | 'modelRouter' | 'advancedAnalytics';

export interface QuotaResult {
  allowed: boolean;
  reason?: string;
  limit?: number;
  current?: number;
}

export async function checkQuota(userId: string, type: QuotaType): Promise<QuotaResult>
export async function checkFeatureAccess(userId: string, feature: FeatureFlag): Promise<boolean>
export async function invalidatePlanCache(planType: PlanType): Promise<void>
```

Internal helpers:
- `getPlanLimits(planType: PlanType): Promise<PlanLimit>` — Redis-first, DB fallback, writes back to Redis on miss.
- `getUserPlanType(userId: string): Promise<PlanType>` — reads `User.plan` from DB.

### Billing Page Components

**`app/[locale]/(dashboard)/billing/page.tsx`** — Server Component. Fetches subscription, plan limits, and daily usage via Prisma. Passes data as props to client components.

**`components/billing/plan-card.tsx`** — Client Component. Displays plan name, price, feature list, and upgrade/manage CTA. Accepts `plan`, `isCurrentPlan`, `onUpgrade` props.

**`components/billing/usage-bar.tsx`** — Client Component. Renders a labeled progress bar for a quota (e.g., tokens/day). Accepts `label`, `current`, `limit`, `unit` props. Uses Radix UI `Progress`.

### prisma/seed.ts (update existing)

The existing `prisma/seed.ts` already seeds `Plan` + `PlanLimit` records. Task 1.4 updates the existing upsert calls to:
- Align quota values with the spec (FREE: 500K tokens/mo, PRO: 20M, TEAM: 100M, ENTERPRISE: null)
- Use `null` for unlimited values (not `-1` — schema uses `Int?` nullable fields)
- Remove any `maxTokensPerDay` references (`PlanLimit` schema has no such field)
- Add `stripeMeteredItemId` and `stripeSeatsItemId` fields to PRO/TEAM upserts (from Req 11/15)
- Populate `stripePriceIdYearly` for PRO and TEAM from `STRIPE_PRO_PRICE_ID_YEARLY` and `STRIPE_TEAM_PRICE_ID_YEARLY` env vars
- Read monthly price IDs from `STRIPE_PRO_PRICE_ID` and `STRIPE_TEAM_PRICE_ID`

---

## Data Models

All models are already defined in `prisma/schema.prisma`. This section documents how they are used by the billing feature.

### Plan

| Field | Usage |
|---|---|
| `name: PlanType` | Unique key used to look up limits and map Stripe prices |
| `stripePriceIdMonthly` | Set for PRO and TEAM; null for FREE and ENTERPRISE |
| `stripePriceIdYearly` | Set for PRO (€290/yr) and TEAM (€990/yr); null for FREE and ENTERPRISE |
| `limits: PlanLimit?` | Joined to get quota values for enforcement |

### PlanLimit

Quota values per plan (updated in `prisma/seed.ts`). `null` = unlimited — `checkQuota` returns `{ allowed: true }` immediately. Note: `PlanLimit` has no `maxTokensPerDay` field — use `maxTokensPerMonth` and `maxRequestsPerDay`.

| Field | FREE | PRO | TEAM | ENTERPRISE |
|---|---|---|---|---|
| `maxTokensPerMonth` | 500,000 | 20,000,000 | 100,000,000 | null |
| `maxRequestsPerDay` | 1,000 | 60,000 | 200,000 | null |
| `maxRequestsPerMinute` | 10 | 60 | 200 | 1,000 |
| `maxProjects` | 1 | 5 | null | null |
| `maxApiKeys` | 1 | 5 | 20 | null |
| `maxWebhooks` | 0 | 10 | 50 | null |
| `maxTeamMembers` | 1 | 1 | 20 | null |
| `contextOptimizerEnabled` | false | true | true | true |
| `modelRouterEnabled` | false | true | true | true |
| `advancedAnalytics` | false | true | true | true |
| `auditLogsRetentionDays` | 7 | 30 | 90 | 365 |
| `supportLevel` | community | email | priority | dedicated |

### Subscription

| Field | Set by |
|---|---|
| `stripeCustomerId` | Checkout API (on first checkout) |
| `stripeSubscriptionId` | `checkout.session.completed` webhook |
| `stripePriceId` | Webhook events |
| `status: SubStatus` | Webhook events |
| `currentPeriodStart/End` | Webhook events |
| `cancelAtPeriodEnd` | `customer.subscription.updated` |
| `canceledAt` | `customer.subscription.deleted` |

### StripeEvent

Used exclusively for idempotency. The webhook handler:
1. Attempts `prisma.stripeEvent.create({ id: event.id, processed: false, ... })`.
2. If the create succeeds, processes the event.
3. Updates `processed: true` on success, stores `error` on failure.
4. If the create throws a unique constraint violation (duplicate event), returns 200 immediately.

### DailyUsageCache

Used by `checkQuota` for `tokens_per_day` and `tokens_per_month`. The `date` field is a `"YYYY-MM-DD"` string. Monthly aggregation sums all rows for the current calendar month prefix.

### Redis Cache Keys

| Key | Value | TTL |
|---|---|---|
| `plan_limits:{planType}` | Serialized `PlanLimit` JSON | 300 s |
| `ratelimit:{userId}:rpm` | Managed by `@upstash/ratelimit` sliding window | Per-window |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Null limit means unlimited

*For any* `QuotaType` and any usage value, when the corresponding `PlanLimit` field is `null`, `checkQuota` must return `{ allowed: true }` regardless of how large the usage value is.

**Validates: Requirements 5.2, 5.3, 5.5, 5.6, 5.7, 5.8**

### Property 2: Quota enforcement correctness

*For any* `QuotaType` with a non-null limit `L` and a current usage value `n`, `checkQuota` must return `{ allowed: true }` when `n < L` and `{ allowed: false }` when `n >= L`. The result must also include the correct `limit` and `current` values.

**Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6, 5.7, 5.8**

### Property 3: Plan limit cache round-trip

*For any* `PlanType`, serializing a `PlanLimit` record to JSON (for Redis storage) and then deserializing it must produce an object that is deeply equal to the original — no fields are lost or mutated.

**Validates: Requirements 5.10**

### Property 4: Webhook idempotency

*For any* Stripe event ID, processing the same event a second time must leave the database in exactly the same state as after the first processing — no records are created, updated, or deleted by the duplicate delivery.

**Validates: Requirements 4.2**

### Property 5: Webhook event produces correct DB state

*For any* Stripe subscription lifecycle event (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`), after the webhook handler completes successfully, the `Subscription` record's `status`, `currentPeriodStart`, `currentPeriodEnd`, and the `User.plan` field must all reflect the values encoded in the Stripe event payload. Specifically, a `customer.subscription.deleted` event must always result in `User.plan === 'FREE'`.

**Validates: Requirements 4.3, 4.4, 4.5, 4.6, 4.7, 7.1, 7.2, 7.3**

### Property 6: Feature access matches plan limits

*For any* user and `FeatureFlag`, `checkFeatureAccess` must return `true` if and only if the corresponding boolean field (`contextOptimizerEnabled`, `modelRouterEnabled`, or `advancedAnalytics`) on the user's `PlanLimit` record is `true`.

**Validates: Requirements 5.11**

### Property 7: Cache invalidation after plan change

*For any* `PlanType`, after `invalidatePlanCache(planType)` is called, a subsequent read of the Redis key `plan_limits:{planType}` must return `null` (cache miss), forcing the next `checkQuota` call to re-fetch from the database.

**Validates: Requirements 5.12, 7.6**

### Property 8: Checkout rejects plans without a Stripe price

*For any* `planId` where `Plan.stripePriceIdMonthly` is `null` (FREE or ENTERPRISE), the checkout endpoint must return HTTP 400 and must not make any call to the Stripe API.

**Validates: Requirements 3.7**

### Property 9: Webhook signature rejection

*For any* request body and any absent or invalid `stripe-signature` header value, the webhook handler must return HTTP 400 and must not write any record to the `StripeEvent` table or any other table.

**Validates: Requirements 4.1, 9.2**

### Property 10: Unauthenticated requests are rejected

*For any* request to `/api/billing/checkout` or `/api/billing/portal` that does not carry a valid Clerk session, the handler must return HTTP 401 and must not make any call to the Stripe API or write any database record.

**Validates: Requirements 3.6, 6.3, 9.3**

### Property 11: No auto-delete on plan downgrade

*For any* user whose plan is downgraded to FREE via a `customer.subscription.deleted` webhook, all existing `Project`, `ApiKey`, and `Webhook` records belonging to that user must remain present in the database after the webhook is processed.

**Validates: Requirements 7.5**

### Property 12: StripeEvent record lifecycle

*For any* incoming Stripe event, a `StripeEvent` record with `processed: false` must exist in the database before any business logic runs; after successful processing it must be updated to `processed: true`; if processing throws, the `error` field must be populated and `processed` must remain `false`.

**Validates: Requirements 4.8**

### Property 13: Plan limits resolve from User.plan

*For any* user with a given `PlanType`, `checkQuota` and `checkFeatureAccess` must resolve limits from the `PlanLimit` record linked to that `PlanType` — not from any other plan's limits.

**Validates: Requirements 2.4**

---

## Error Handling

### Checkout API

| Condition | Response |
|---|---|
| Not authenticated | 401 `{ error: "Unauthorized" }` |
| Invalid / missing planId | 400 `{ error: "Invalid plan. Plan must have a Stripe price configured." }` |
| Active subscription exists | 409 `{ error: "Active subscription already exists. Use the billing portal to change plans." }` |
| Stripe API error | 500 `{ error: "Failed to create checkout session" }` |

### Portal API

| Condition | Response |
|---|---|
| Not authenticated | 401 `{ error: "Unauthorized" }` |
| No stripeCustomerId | 400 `{ error: "No billing account found. Please subscribe to a plan first." }` |
| Stripe API error | 500 `{ error: "Failed to create portal session" }` |

### Webhook Handler

| Condition | Response |
|---|---|
| Missing / invalid signature | 400 `{ error: "Invalid signature" }` |
| Duplicate event (already processed) | 200 (silent) |
| Unknown event type | 200 (ignored, not an error) |
| Processing error | 500 — triggers Stripe retry; `StripeEvent.error` is populated |

### Plan Guard

- If Redis is unavailable, `getPlanLimits` falls back to a direct DB query (never throws).
- If the user record is not found, `checkQuota` returns `{ allowed: false, reason: "User not found" }`.
- Rate limiter errors from `@upstash/ratelimit` are caught; on error, the request is allowed through (fail-open) to avoid blocking legitimate traffic.

### Billing Page

- If the Stripe API is unreachable when creating a checkout/portal session, the page displays an inline error toast (not a full-page error).
- Missing subscription data renders the FREE plan state by default.

---

## Testing Strategy

### Unit Tests (Vitest)

Focus on pure logic and isolated functions:

- `lib/plan-guard.ts`: test `checkQuota` for each `QuotaType` with mocked Prisma and Redis clients. Cover null-limit (unlimited) cases, boundary values (at limit, one over), and the fail-open Redis error path.
- `lib/stripe.ts`: test that missing `STRIPE_SECRET_KEY` throws at import time.
- Webhook handler: test each event type with mocked Stripe SDK and Prisma. Test idempotency (duplicate event ID). Test signature failure path.
- Checkout API: test 401 (unauthenticated), 400 (null price), 409 (active subscription), and happy path with mocked Stripe.

### Property-Based Tests (Vitest + fast-check)

Use `fast-check` for property-based testing. Each test runs a minimum of 100 iterations.

**Property 1 — Null limit means unlimited**
```
// Feature: stripe-billing, Property 1: null limit means unlimited
// For any QuotaType with a null PlanLimit field, checkQuota returns { allowed: true }
```
Generate: random `QuotaType`, random usage value. Set the corresponding limit to `null`. Assert `result.allowed === true`.

**Property 2 — Quota enforcement is monotone**
```
// Feature: stripe-billing, Property 2: quota enforcement is monotone
```
Generate: random non-null limit `L`, two usage values `n < m` both `> L`. Assert both calls return `{ allowed: false }`.

**Property 3 — Plan limit cache round-trip**
```
// Feature: stripe-billing, Property 3: plan limit cache round-trip
```
Generate: random `PlanLimit`-shaped object. Serialize to JSON, deserialize. Assert deep equality.

**Property 4 — Webhook idempotency**
```
// Feature: stripe-billing, Property 4: webhook idempotency
```
Generate: random Stripe event payload. Process it twice against an in-memory DB mock. Assert the DB state after the second call equals the state after the first call.

**Property 5 — Subscription status reflects Stripe state**
```
// Feature: stripe-billing, Property 5: subscription status reflects Stripe state
```
Generate: random `SubStatus` value and a matching Stripe event payload. Process the webhook. Assert `Subscription.status` equals the generated status.

**Property 6 — Plan downgrade on cancellation**
```
// Feature: stripe-billing, Property 6: plan downgrade on cancellation
```
Generate: random non-FREE `PlanType`. Set user plan to that type. Process a `customer.subscription.deleted` event. Assert `User.plan === 'FREE'`.

**Property 7 — Feature access matches plan limits**
```
// Feature: stripe-billing, Property 7: feature access matches plan limits
```
Generate: random `FeatureFlag` and random boolean value for the corresponding `PlanLimit` field. Assert `checkFeatureAccess` returns that boolean.

**Property 8 — Cache invalidation after plan change**
```
// Feature: stripe-billing, Property 8: cache invalidation after plan change
```
Generate: random `PlanType`. Write a value to `plan_limits:{planType}` in Redis mock. Call `invalidatePlanCache`. Assert the key no longer exists.

**Property 9 — Checkout requires valid price**
```
// Feature: stripe-billing, Property 9: checkout requires valid price
```
Generate: random plan with `stripePriceIdMonthly: null`. Assert the checkout handler returns a status >= 400.

**Property 10 — Webhook signature rejection**
```
// Feature: stripe-billing, Property 10: webhook signature rejection
```
Generate: random request body and random (invalid) signature header. Assert the handler returns HTTP 400 and no DB write occurs.

### Integration Tests

- Full checkout flow: mock Stripe SDK, real Prisma against a test DB (Neon branch via `NEON_BRANCH` env). Verify `Subscription` and `User.plan` are updated correctly.
- Webhook processing: POST a real-shaped Stripe event payload to the handler in a test environment. Verify DB state.

### E2E Tests (Playwright)

- Billing page renders correctly for FREE, PRO, and TEAM plan states.
- "Upgrade" button triggers a redirect to a Stripe-shaped URL (mock Stripe in test env).
- "Manage billing" button is visible only for paying subscribers.
- PAST_DUE warning banner appears when subscription status is `PAST_DUE`.
- `cancelAtPeriodEnd: true` shows the "subscription ends on" notice.

---

## Extended Features (Requirements 10–17)

---

### Req 10 — Transactional Billing Emails

#### Email Templates

Five new React Email templates, each following the same structure as `components/emails/user-welcome.tsx` (HTML/CSS-in-JS, bilingual EN/FR, `locale` prop):

| File | Trigger |
|---|---|
| `components/emails/billing-upgrade.tsx` | `checkout.session.completed` → ACTIVE |
| `components/emails/billing-receipt.tsx` | `invoice.payment_succeeded` |
| `components/emails/billing-payment-failed.tsx` | `invoice.payment_failed` |
| `components/emails/billing-renewal-reminder.tsx` | BullMQ daily job (7-day window) |
| `components/emails/billing-downgrade.tsx` | `customer.subscription.deleted` → FREE |

All templates accept at minimum `{ email: string; locale?: 'en' | 'fr' }` plus event-specific props (e.g., `invoiceAmount`, `invoicePdfUrl`, `renewalDate`, `planName`).

#### Sending Pattern

New helper functions added to `lib/resend.ts`, matching the existing `sendUserWelcomeEmail` signature:

```typescript
export async function sendBillingUpgradeEmail(email: string, planName: string, locale?: 'en' | 'fr'): Promise<{ success: boolean }>
export async function sendBillingReceiptEmail(email: string, amount: string, invoicePdfUrl: string, locale?: 'en' | 'fr'): Promise<{ success: boolean }>
export async function sendBillingPaymentFailedEmail(email: string, portalUrl: string, locale?: 'en' | 'fr'): Promise<{ success: boolean }>
export async function sendBillingRenewalReminderEmail(email: string, renewalDate: Date, amount: string, locale?: 'en' | 'fr'): Promise<{ success: boolean }>
export async function sendBillingDowngradeEmail(email: string, lostFeatures: string[], locale?: 'en' | 'fr'): Promise<{ success: boolean }>
```

Each function wraps `resend.emails.send` in a try/catch. On error: `console.error` + `Sentry.captureException`. Never throws — fire-and-forget from the webhook handler.

#### Renewal Reminder Worker

`workers/billing-renewal-reminder.worker.ts` — BullMQ worker, scheduled daily via a repeatable job:

```typescript
// Scheduled: every day at 09:00 UTC
// Query: subscriptions where currentPeriodEnd BETWEEN now() AND now() + 7 days AND status = ACTIVE
// For each: enqueue a 'send-renewal-reminder' job with { userId, email, renewalDate, amount }
```

The worker enqueues jobs into a `billing-emails` BullMQ queue; a separate processor calls `sendBillingRenewalReminderEmail`. This decouples scheduling from sending and allows retries on email failure.

---

### Req 11 — Usage-Based Add-On Billing

#### Schema Changes

Two new optional fields on the `Subscription` model:

```prisma
model Subscription {
  // ... existing fields ...
  stripeMeteredItemId  String?  // Stripe subscription item ID for token overage
  stripeSeatsItemId    String?  // Stripe subscription item ID for seat add-on
}
```

These are populated when the subscription is created (from the `checkout.session.completed` webhook, by inspecting `subscription.items.data`).

#### Environment Variables

```
STRIPE_PRO_OVERAGE_PRICE_ID=price_xxx   # Stripe metered price for PRO overage
STRIPE_TEAM_OVERAGE_PRICE_ID=price_xxx  # Stripe metered price for TEAM overage
```

#### lib/overage.ts

```typescript
/**
 * Records a Stripe usage record for token overage and updates DailyUsageCache.
 * Called by plan-guard when a PRO/TEAM user exceeds maxTokensPerMonth.
 */
export async function recordOverage(userId: string, overageTokens: number): Promise<void>
```

Internally:
1. Fetch `Subscription.stripeMeteredItemId` for the user.
2. Call `stripe.subscriptionItems.createUsageRecord(stripeMeteredItemId, { quantity: overageTokens, action: 'set', timestamp: 'now' })`.
3. Update `DailyUsageCache.overageTokens` (new optional field) for today's record.
4. On Stripe error: log to Sentry, do not throw (overage billing failure must not block the user's request).

#### lib/plan-guard.ts Modification

The `tokens_per_month` quota check for PRO and TEAM plans is modified:

```typescript
// Before (hard block for all plans):
if (current >= limit) return { allowed: false, reason: 'quota_exceeded', ... }

// After (soft block with overage for PRO/TEAM):
if (current >= limit) {
  if (planType === 'PRO' || planType === 'TEAM') {
    await recordOverage(userId, requestTokens)
    return { allowed: true, overage: true }
  }
  return { allowed: false, reason: 'quota_exceeded', ... }
}
```

FREE and ENTERPRISE plans are unaffected (FREE hard-blocks, ENTERPRISE has null limit → always allowed).

---

### Req 12 — Contextual In-App Upsell

#### Server Action

`app/[locale]/(dashboard)/billing/_actions.ts`:

```typescript
export async function getUpsellState(userId: string): Promise<{
  show: boolean
  quotaType: 'tokens_per_day' | 'tokens_per_month' | null
  percentUsed: number
  currentLimit: number
  nextPlanLimit: number
  nextPlan: 'PRO' | 'TEAM' | null
}>
```

Logic:
1. Fetch user's `PlanType` and `PlanLimit`.
2. Compute `percentUsed` for `tokens_per_day` and `tokens_per_month`.
3. If either ≥ 80%: check Redis key `upsell:{userId}:{quotaType}:{YYYY-MM-DD}`.
4. If key absent: set it (TTL 86400 s), return `{ show: true, ... }`.
5. If key present: return `{ show: false }` (already shown today).

#### Redis Dedup Key

```
upsell:{userId}:{quotaType}:{YYYY-MM-DD}   TTL: 86400s
```

Set with `SET ... EX 86400 NX` (only set if not exists) to prevent race conditions.

#### Components

**`components/billing/upsell-banner.tsx`** — Client Component, non-blocking:
- Shown when `percentUsed >= 80` and `percentUsed < 100`.
- Dismissible (sets a local state; does not clear the Redis key).
- CTA: `<Button variant="cta-accent">Upgrade to {nextPlan}</Button>` linking to `/billing`.
- Displays: current quota type, `percentUsed`%, current limit, next plan's limit.

**`components/billing/upsell-modal.tsx`** — Client Component, blocking:
- Shown when `percentUsed >= 100` and user is on FREE plan.
- Cannot be dismissed without upgrading or waiting for quota reset.
- CTA: `<Button variant="cta-accent">Upgrade — unlock {nextPlanLimit} tokens</Button>`.

#### Dashboard Integration

The dashboard layout (`app/[locale]/(dashboard)/layout.tsx`) calls `getUpsellState(userId)` as a Server Component on every render and passes the result to `<UpsellBanner>` / `<UpsellModal>` as props.

---

### Req 13 — Trial Period

#### Checkout Modification

In `app/api/billing/checkout/route.ts`, when `planId` is PRO and the user has no prior `Subscription` record (or `Subscription.status` is not ACTIVE/TRIALING):

```typescript
const sessionParams: Stripe.Checkout.SessionCreateParams = {
  // ... existing params ...
  subscription_data: {
    trial_period_days: 14,
  },
}
```

No credit card is required during trial — Stripe handles this via `payment_method_collection: 'if_required'` on the session.

#### New Webhook Event: `customer.subscription.trial_will_end`

Added to the webhook handler's event switch:

```typescript
case 'customer.subscription.trial_will_end':
  // 1. Send trial ending reminder email (sendBillingTrialEndingEmail)
  // 2. Log audit entry: action = 'billing.trial_ending'
  // 3. dispatchWebhook(userId, 'billing.trial_ending', { trialEnd, planName })
  break
```

#### `customer.subscription.updated` with `status: 'trialing'`

Existing handler extended: when the new status is `trialing`, set `User.plan = PRO` and `Subscription.status = TRIALING`.

#### Feature Access During Trial

`checkFeatureAccess` and `checkQuota` already resolve against `User.plan`. Since trial sets `User.plan = PRO`, trial users automatically get PRO limits — no special-casing needed.

---

### Req 14 — Invoice History

#### Server-Side Data Fetch

In `app/[locale]/(dashboard)/billing/page.tsx` (Server Component):

```typescript
async function getInvoices(stripeCustomerId: string): Promise<Stripe.Invoice[]> {
  try {
    const { data } = await stripe.invoices.list({ customer: stripeCustomerId, limit: 12 })
    return data
  } catch {
    return [] // Error boundary: return empty array, never throw
  }
}
```

Called only when `subscription.stripeCustomerId` is non-null. The result is passed as a prop to `<InvoiceList>`.

#### Component

**`components/billing/invoice-list.tsx`** — Client Component:

```typescript
interface InvoiceListProps {
  invoices: Array<{
    id: string
    created: number        // Unix timestamp
    amount_due: number     // In cents
    currency: string
    status: string         // 'paid' | 'open' | 'void'
    invoice_pdf: string | null
  }>
}
```

Renders a table with columns: Date, Amount, Status (badge), Download (link to `invoice_pdf`). If `invoices` is empty, renders an empty state ("No invoices yet."). Wrapped in an error boundary at the page level — if the Stripe call fails, the section simply does not render.

---

### Req 15 — Additional Seats

#### lib/seats.ts

```typescript
/**
 * Updates the Stripe seat quantity for a TEAM subscription when member count changes.
 * Called from team member add/remove server actions.
 */
export async function updateSeatCount(userId: string, newMemberCount: number): Promise<void>
```

Logic:
1. Fetch `Subscription` for userId → get `stripeSeatsItemId` and `status`.
2. If `status !== ACTIVE` or `stripeSeatsItemId` is null → return early (no-op).
3. `overageSeats = Math.max(0, newMemberCount - 20)`.
4. `stripe.subscriptions.update(stripeSubscriptionId, { items: [{ id: stripeSeatsItemId, quantity: overageSeats }], proration_behavior: 'always_invoice' })`.
5. On Stripe error: log to Sentry, rethrow (seat update failure should surface to the caller — unlike overage, this is a synchronous billing action).

Called from:
- Team member add action: after DB insert, call `updateSeatCount(ownerId, newCount)`.
- Team member remove action: after DB delete, call `updateSeatCount(ownerId, newCount)`.

#### Component

**`components/billing/seat-usage.tsx`** — Client Component, rendered on the billing page for TEAM plan users:

```typescript
interface SeatUsageProps {
  currentMembers: number   // Total team members
  includedSeats: number    // Always 20 for TEAM
  additionalSeats: number  // Math.max(0, currentMembers - 20)
  additionalCostEur: number // additionalSeats * 15
}
```

Displays: "X / 20 included seats · Y additional seats · €Z/mo".

---

### Req 16 — Admin Billing Dashboard

#### Page

`app/[locale]/(admin)/admin/billing/page.tsx` — Server Component, protected by existing admin RBAC check (same pattern as `app/[locale]/(admin)/admin/users/page.tsx`).

All data fetched via Prisma — no Stripe API calls:

```typescript
// Plan distribution
const planDistribution = await prisma.subscription.groupBy({
  by: ['planId'],
  _count: { planId: true },
  where: { status: { in: ['ACTIVE', 'TRIALING'] } },
})

// MRR: join active subscriptions with Plan.price
const activeSubscriptions = await prisma.subscription.findMany({
  where: { status: { in: ['ACTIVE', 'TRIALING'] } },
  include: { plan: true },
})
const mrr = activeSubscriptions.reduce((sum, s) => sum + (s.plan.price ?? 0), 0)

// Recent billing events
const recentEvents = await prisma.auditLog.findMany({
  where: { action: { startsWith: 'billing.' } },
  orderBy: { createdAt: 'desc' },
  take: 20,
})

// Churn rate (last 30 days)
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
const [canceledCount, totalCount] = await Promise.all([
  prisma.subscription.count({ where: { canceledAt: { gte: thirtyDaysAgo } } }),
  prisma.subscription.count(),
])
const churnRate = totalCount > 0 ? (canceledCount / totalCount) * 100 : 0
```

Note: `Plan` model needs a `price: Float?` field (or derive from `stripePriceIdMonthly` mapping). If not present, MRR is computed from a hardcoded plan→price map (`{ PRO: 29, TEAM: 99 }`).

#### Components

**`components/admin/billing-stats.tsx`** — displays plan distribution (counts per PlanType), MRR (€), and churn rate (%).

**`components/admin/billing-events.tsx`** — renders the last 20 `AuditLog` entries with `action`, `userId`, and `createdAt`.

Both are Server Components receiving data as props from the page.

---

### Req 17 — GateCtr Webhook Events for Billing

#### Dispatch Points

All billing webhook events are dispatched via the existing `dispatchWebhook(userId, event, data)` function from `lib/webhooks.ts`. Calls are fire-and-forget (no `await`, errors caught internally by `dispatchWebhook`).

Dispatch is added to the Stripe webhook handler **after** the DB update completes:

| Stripe Event | After DB Update | GateCtr Event |
|---|---|---|
| `checkout.session.completed` (new sub) | `User.plan` updated to PRO/TEAM | `billing.plan_upgraded` |
| `customer.subscription.updated` (upgrade) | `User.plan` updated to higher plan | `billing.plan_upgraded` |
| `customer.subscription.updated` (downgrade) | `User.plan` updated to lower plan | `billing.plan_downgraded` |
| `customer.subscription.updated` (trialing) | `Subscription.status = TRIALING` | `billing.trial_started` |
| `customer.subscription.deleted` | `User.plan = FREE` | `billing.plan_downgraded` |
| `customer.subscription.trial_will_end` | Audit log written | `billing.trial_ending` |
| `invoice.payment_failed` | `Subscription.status = PAST_DUE` | `billing.payment_failed` |

#### Payload Shape

```typescript
// billing.plan_upgraded / billing.plan_downgraded
{
  event: 'billing.plan_upgraded',
  project_id: userId,
  timestamp: new Date().toISOString(),
  data: {
    previous_plan: 'FREE',
    new_plan: 'PRO',
    subscription_id: stripeSubscriptionId,
  }
}

// billing.trial_started / billing.trial_ending
{
  event: 'billing.trial_started',
  project_id: userId,
  timestamp: new Date().toISOString(),
  data: {
    plan: 'PRO',
    trial_end: subscription.trialEnd?.toISOString(),
  }
}

// billing.payment_failed
{
  event: 'billing.payment_failed',
  project_id: userId,
  timestamp: new Date().toISOString(),
  data: {
    subscription_id: stripeSubscriptionId,
    invoice_id: invoiceId,
  }
}
```

---

### Req 18 — Annual Billing Plans

#### Checkout Modification

The checkout API accepts an optional `interval: 'monthly' | 'yearly'` parameter (defaults to `'monthly'`). Price ID resolution:

```typescript
const priceId = interval === 'yearly'
  ? plan.stripePriceIdYearly
  : plan.stripePriceIdMonthly

if (!priceId) {
  return NextResponse.json(
    { error: interval === 'yearly'
        ? 'Annual billing is not available for this plan.'
        : 'Invalid plan. Plan must have a Stripe price configured.' },
    { status: 400 }
  )
}
```

#### Environment Variables

```
STRIPE_PRO_PRICE_ID=price_xxx           # Stripe monthly price for PRO
STRIPE_TEAM_PRICE_ID=price_xxx          # Stripe monthly price for TEAM
STRIPE_PRO_PRICE_ID_YEARLY=price_xxx    # Stripe yearly price for PRO (€290/yr)
STRIPE_TEAM_PRICE_ID_YEARLY=price_xxx   # Stripe yearly price for TEAM (€990/yr)
```

#### Billing Page Toggle

The billing page renders a controlled monthly/annual toggle above the plan cards. The selected interval is stored in local React state and passed to the checkout API call.

```typescript
// State in billing page client component
const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly')

// Price display logic
const displayPrice = interval === 'yearly'
  ? { PRO: '€290/yr', TEAM: '€990/yr' }
  : { PRO: '€29/mo', TEAM: '€99/mo' }

// Savings badge (annual only)
const savings = interval === 'yearly' ? 'Save 17%' : null
```

The toggle uses two `Button` components with `cta-secondary` (inactive) / `cta-primary` (active) variants. The savings badge uses a `Badge` component with a green/success variant.

#### Billing Interval Display

For active subscribers, the billing page shows the current interval derived from `Subscription.stripePriceId` by comparing against the known yearly price IDs. Example: "Pro · Annual · Renews Jan 15, 2027".

---

## Additional Correctness Properties (Requirements 10–17)

### Property 14: Trial users get PRO feature access

*For any* user with `Subscription.status = TRIALING` and `User.plan = PRO`, `checkFeatureAccess` must return `true` for all PRO feature flags (`contextOptimizerEnabled`, `modelRouterEnabled`, `advancedAnalytics`), and `checkQuota` must resolve against PRO `PlanLimit` values (not FREE).

**Validates: Requirements 13.2, 13.6**

### Property 15: Overage billing only for PRO/TEAM

*For any* user with `PlanType = FREE`, when monthly token consumption reaches `maxTokensPerMonth`, `checkQuota` must return `{ allowed: false }` and must never call `recordOverage`. *For any* user with `PlanType = PRO` or `TEAM`, when monthly token consumption exceeds `maxTokensPerMonth`, `checkQuota` must return `{ allowed: true, overage: true }` and must call `recordOverage` exactly once per invocation.

**Validates: Requirements 11.1, 11.3**

### Property 16: Upsell dedup via Redis

*For any* `userId`, `quotaType`, and calendar date, `getUpsellState` must return `{ show: true }` at most once per (userId, quotaType, date) triple. A second call on the same day for the same quota type must return `{ show: false }`, regardless of the current usage percentage.

**Validates: Requirement 12.3**

### Property 17: Seat overage calculation correctness

*For any* `newMemberCount` value, `updateSeatCount` must pass `quantity = Math.max(0, newMemberCount - 20)` to `stripe.subscriptions.update`. Specifically: for `newMemberCount <= 20`, quantity must be `0`; for `newMemberCount = 21`, quantity must be `1`; for `newMemberCount = N > 20`, quantity must be `N - 20`.

**Validates: Requirements 15.1, 15.2, 15.3**

### Property 18: Admin MRR calculation correctness

*For any* set of ACTIVE and TRIALING subscriptions with known plan prices, the MRR value displayed on the admin billing page must equal the exact arithmetic sum of all those plans' monthly prices. Subscriptions with `status = CANCELED`, `PAST_DUE`, or `INCOMPLETE` must not contribute to the MRR total.

**Validates: Requirement 16.3**

### Property 19: GateCtr webhook fired for every plan change

*For any* Stripe lifecycle event that results in a `User.plan` change (upgrade, downgrade, trial start, cancellation), `dispatchWebhook` must be called exactly once with the correct event name and a payload containing the correct `previous_plan` and `new_plan` values. If the DB update fails (and throws), `dispatchWebhook` must not be called.

**Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5**

### Property 20: Invoice list never throws on Stripe API failure

*For any* Stripe API error (network timeout, 5xx, rate limit) thrown by `stripe.invoices.list`, the `getInvoices` function must return an empty array `[]` and must not propagate the exception. The billing page must render successfully with an empty invoice section rather than an error boundary fallback.

**Validates: Requirement 14.5**
