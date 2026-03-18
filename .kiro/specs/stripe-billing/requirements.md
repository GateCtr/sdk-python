# Requirements Document

## Introduction

This document defines the requirements for Phase 2 of GateCtr: Stripe billing and plan management. The feature enables users to upgrade from the Free plan to paid plans (Pro at €29/mo, Team at €99/mo, Enterprise on request) via Stripe Checkout, manages subscription lifecycle through Stripe webhooks, enforces per-plan quotas on every API request, and provides a self-service billing portal for subscription management.

The system integrates with the existing Clerk authentication, Prisma schema (Subscription, Plan, PlanLimit, StripeEvent models), and Upstash Redis for quota enforcement. GateCtr charges a flat subscription for the control layer — it never takes a commission on tokens.

## Glossary

- **Billing_System**: The GateCtr Stripe billing subsystem, encompassing checkout, webhooks, quota enforcement, and the billing portal.
- **Checkout_API**: The Next.js API route at `app/api/billing/checkout/route.ts` that creates Stripe Checkout Sessions.
- **Webhook_Handler**: The Next.js API route at `app/api/webhooks/stripe/route.ts` that processes Stripe events.
- **Plan_Guard**: The quota enforcement module at `lib/plan-guard.ts` that verifies plan limits before allowing API requests.
- **Stripe_Client**: The singleton Stripe SDK instance at `lib/stripe.ts`.
- **Portal_API**: The Next.js API route at `app/api/billing/portal/route.ts` that creates Stripe Customer Portal sessions.
- **Subscription**: A Prisma record linking a User to a Plan, a Stripe customer ID, and a Stripe subscription ID.
- **PlanType**: The enum `FREE | PRO | TEAM | ENTERPRISE` stored on the User record and the Plan model.
- **Quota**: A measurable limit defined in PlanLimit (tokens/day, tokens/month, requests/minute, projects, API keys, webhooks, team members).
- **DailyUsageCache**: The Prisma model tracking per-user daily token and request counts, used by Plan_Guard for quota checks.
- **StripeEvent**: The Prisma model storing processed Stripe event IDs for idempotency.
- **Billing_Page**: The dashboard page at `app/[locale]/(dashboard)/billing/page.tsx` showing current plan, usage, and upgrade options.

---

## Requirements

### Requirement 1: Stripe Client Initialization

**User Story:** As a developer, I want a singleton Stripe client configured from environment variables, so that all billing operations use a consistent, type-safe Stripe instance.

#### Acceptance Criteria

1. THE Stripe_Client SHALL be initialized with the `STRIPE_SECRET_KEY` environment variable and the `apiVersion` set to `"2026-02-25.clover"`.
2. IF `STRIPE_SECRET_KEY` is not set at runtime, THEN THE Stripe_Client SHALL throw a configuration error with the message `"STRIPE_SECRET_KEY is not set"`.
3. THE Stripe_Client SHALL export a single instance reusable across all server-side modules via `lib/stripe.ts`.
4. THE Stripe_Client SHALL be typed with TypeScript strict mode, exposing no `any` types in its public interface.

---

### Requirement 2: Stripe Product and Price Configuration

**User Story:** As a platform operator, I want Stripe products and prices seeded in the database, so that checkout sessions reference the correct Stripe price IDs for each plan.

#### Acceptance Criteria

1. THE Billing_System SHALL store `stripePriceIdMonthly` on the Plan model for PRO (€29/mo) and TEAM (€99/mo) plans.
2. THE Billing_System SHALL store `stripePriceIdYearly` on the Plan model for PRO (€290/yr) and TEAM (€990/yr) plans (approximately 17% discount vs monthly).
3. THE Billing_System SHALL leave `stripePriceIdMonthly` and `stripePriceIdYearly` null for the FREE plan, as it requires no Stripe price.
4. THE Billing_System SHALL leave `stripePriceIdMonthly` and `stripePriceIdYearly` null for the ENTERPRISE plan, as it uses custom pricing via sales.
5. WHEN the Plan_Guard reads plan limits, THE Billing_System SHALL resolve limits from the PlanLimit record linked to the user's current `PlanType` on the User model.
6. THE Billing_System SHALL update `prisma/seed.ts` to upsert PlanLimit records for all four PlanTypes with the following values (using `null` for unlimited, not `-1`):

   | Quota                   | FREE    | PRO     | TEAM       | ENTERPRISE  |
   |-------------------------|---------|---------|------------|-------------|
   | maxTokensPerMonth       | 500,000 | 20,000,000 | 100,000,000 | null (unlimited) |
   | maxRequestsPerDay       | 1,000   | 60,000  | 200,000    | null (unlimited) |
   | maxRequestsPerMinute    | 10      | 60      | 200        | 1,000       |
   | maxProjects             | 1       | 5       | null (unlimited) | null (unlimited) |
   | maxApiKeys              | 1       | 5       | 20         | null (unlimited) |
   | maxWebhooks             | 0       | 10      | 50         | null (unlimited) |
   | maxTeamMembers          | 1       | 1       | 20         | null (unlimited) |
   | contextOptimizerEnabled | false   | true    | true       | true        |
   | modelRouterEnabled      | false   | true    | true       | true        |
   | advancedAnalytics       | false   | true    | true       | true        |
   | auditLogsRetentionDays  | 7       | 30      | 90         | 365         |
   | supportLevel            | community | email | priority   | dedicated   |

   Note: `PlanLimit` schema does not have `maxTokensPerDay` — use `maxTokensPerMonth` and `maxRequestsPerDay` only. All unlimited values use `null` (not `-1`).

---

### Requirement 3: Checkout Session Creation

**User Story:** As a Free plan user, I want to click "Upgrade to Pro" and be redirected to a Stripe Checkout page, so that I can enter payment details and activate my paid subscription.

#### Acceptance Criteria

1. WHEN an authenticated user sends a POST request to `/api/billing/checkout` with a valid `planId` (PRO or TEAM) and an optional `interval` (`'monthly'` or `'yearly'`, defaulting to `'monthly'`), THE Checkout_API SHALL create a Stripe Checkout Session in `subscription` mode using the corresponding `stripePriceIdMonthly` or `stripePriceIdYearly` and return its `url`.
2. WHEN a Stripe customer record does not yet exist for the user, THE Checkout_API SHALL create a Stripe customer with the user's email and store the resulting `stripeCustomerId` on the Subscription record.
3. WHEN a Stripe customer record already exists for the user, THE Checkout_API SHALL reuse the existing `stripeCustomerId` when creating the Checkout Session.
4. THE Checkout_API SHALL set `success_url` to `{NEXT_PUBLIC_APP_URL}/billing?session_id={CHECKOUT_SESSION_ID}` and `cancel_url` to `{NEXT_PUBLIC_APP_URL}/billing`.
5. THE Checkout_API SHALL set `allow_promotion_codes: true` on the Checkout Session.
6. IF the requesting user is not authenticated via Clerk, THEN THE Checkout_API SHALL return HTTP 401.
7. IF the `planId` in the request body does not correspond to a Plan with a non-null price ID for the requested `interval`, THEN THE Checkout_API SHALL return HTTP 400 with a descriptive error message.
8. IF the user already has an ACTIVE subscription, THEN THE Checkout_API SHALL return HTTP 409 with the message `"Active subscription already exists. Use the billing portal to change plans."`.
9. THE Checkout_API SHALL pass the Clerk `userId` as `client_reference_id` on the Checkout Session for webhook reconciliation.

---

### Requirement 4: Stripe Webhook Processing

**User Story:** As a platform operator, I want Stripe lifecycle events processed reliably, so that user plan status, subscription records, and quota limits stay in sync with Stripe.

#### Acceptance Criteria

1. THE Webhook_Handler SHALL verify every incoming request using the `STRIPE_WEBHOOK_SECRET` environment variable and the Stripe SDK's `constructEvent` method; IF verification fails, THEN THE Webhook_Handler SHALL return HTTP 400.
2. THE Webhook_Handler SHALL implement idempotency by checking the StripeEvent table before processing; IF the event ID already exists with `processed: true`, THEN THE Webhook_Handler SHALL return HTTP 200 without reprocessing.
3. WHEN a `checkout.session.completed` event is received, THE Webhook_Handler SHALL create or update the Subscription record with `stripeSubscriptionId`, `stripeCustomerId`, `stripePriceId`, `status: ACTIVE`, `currentPeriodStart`, and `currentPeriodEnd`, and SHALL update the User's `plan` field to the corresponding PlanType.
4. WHEN a `customer.subscription.updated` event is received, THE Webhook_Handler SHALL update the Subscription record's `status`, `currentPeriodStart`, `currentPeriodEnd`, `cancelAtPeriodEnd`, and `stripePriceId`, and SHALL update the User's `plan` field to match the new price's corresponding PlanType.
5. WHEN a `customer.subscription.deleted` event is received, THE Webhook_Handler SHALL set the Subscription `status` to CANCELED, set `canceledAt` to the current timestamp, and SHALL downgrade the User's `plan` to FREE.
6. WHEN an `invoice.payment_failed` event is received, THE Webhook_Handler SHALL set the Subscription `status` to PAST_DUE and SHALL log an audit entry with action `"billing.payment_failed"`.
7. WHEN an `invoice.payment_succeeded` event is received for a subscription renewal, THE Webhook_Handler SHALL update `currentPeriodStart` and `currentPeriodEnd` on the Subscription record and SHALL ensure the User's `plan` remains set to the correct PlanType.
8. THE Webhook_Handler SHALL write a StripeEvent record with `processed: false` before processing and update it to `processed: true` upon successful completion; IF processing throws an error, THE Webhook_Handler SHALL store the error message in `StripeEvent.error` and return HTTP 500 to trigger Stripe's retry mechanism.
9. THE Webhook_Handler SHALL log all subscription state changes to the AuditLog with the appropriate action string (e.g., `"billing.subscription_activated"`, `"billing.subscription_canceled"`, `"billing.plan_downgraded"`).

---

### Requirement 5: Quota Enforcement

**User Story:** As a platform operator, I want every API request to be checked against the user's plan limits before processing, so that users cannot exceed their quota and GateCtr can enforce plan boundaries reliably.

#### Acceptance Criteria

1. THE Plan_Guard SHALL expose a `checkQuota(userId: string, type: QuotaType)` function that returns `{ allowed: boolean; reason?: string; limit?: number; current?: number }`.
2. WHEN `checkQuota` is called with `type: "tokens_per_day"`, THE Plan_Guard SHALL read the user's `DailyUsageCache` for today's date and compare `totalTokens` against `PlanLimit.maxTokensPerDay`; IF `maxTokensPerDay` is null, THE Plan_Guard SHALL return `{ allowed: true }`.
3. WHEN `checkQuota` is called with `type: "tokens_per_month"`, THE Plan_Guard SHALL aggregate `DailyUsageCache` records for the current calendar month and compare the sum against `PlanLimit.maxTokensPerMonth`; IF `maxTokensPerMonth` is null, THE Plan_Guard SHALL return `{ allowed: true }`.
4. WHEN `checkQuota` is called with `type: "requests_per_minute"`, THE Plan_Guard SHALL use Upstash Redis with a sliding window counter keyed by `ratelimit:{userId}:rpm` and compare against `PlanLimit.maxRequestsPerMinute`.
5. WHEN `checkQuota` is called with `type: "projects"`, THE Plan_Guard SHALL count active Project records for the user and compare against `PlanLimit.maxProjects`; IF `maxProjects` is null, THE Plan_Guard SHALL return `{ allowed: true }`.
6. WHEN `checkQuota` is called with `type: "api_keys"`, THE Plan_Guard SHALL count active ApiKey records for the user and compare against `PlanLimit.maxApiKeys`; IF `maxApiKeys` is null, THE Plan_Guard SHALL return `{ allowed: true }`.
7. WHEN `checkQuota` is called with `type: "webhooks"`, THE Plan_Guard SHALL count active Webhook records for the user and compare against `PlanLimit.maxWebhooks`; IF `maxWebhooks` is null, THE Plan_Guard SHALL return `{ allowed: true }`.
8. WHEN `checkQuota` is called with `type: "team_members"`, THE Plan_Guard SHALL count TeamMember records for all teams owned by the user and compare against `PlanLimit.maxTeamMembers`; IF `maxTeamMembers` is null, THE Plan_Guard SHALL return `{ allowed: true }`.
9. IF `checkQuota` returns `{ allowed: false }`, THEN the calling API route SHALL return HTTP 429 with a JSON body containing `{ error: "quota_exceeded", quota: QuotaType, limit: number, current: number, upgradeUrl: "/billing" }`.
10. THE Plan_Guard SHALL cache PlanLimit records in Upstash Redis with a TTL of 300 seconds, keyed by `plan_limits:{planType}`, to avoid repeated database reads on every request.
11. THE Plan_Guard SHALL expose a `checkFeatureAccess(userId: string, feature: FeatureFlag)` function that returns `boolean`, resolving against `PlanLimit.contextOptimizerEnabled`, `PlanLimit.modelRouterEnabled`, and `PlanLimit.advancedAnalytics`.
12. WHEN a user's plan is downgraded (e.g., subscription canceled), THE Plan_Guard SHALL invalidate the cached PlanLimit entry in Redis for that user's previous plan.

---

### Requirement 6: Billing Portal

**User Story:** As a paying subscriber, I want to access a Stripe-hosted billing portal, so that I can update my payment method, view invoices, and cancel or change my subscription without contacting support.

#### Acceptance Criteria

1. WHEN an authenticated user sends a POST request to `/api/billing/portal`, THE Portal_API SHALL create a Stripe Billing Portal Session using the user's `stripeCustomerId` and return its `url`.
2. THE Portal_API SHALL set the `return_url` to `{NEXT_PUBLIC_APP_URL}/billing`.
3. IF the requesting user is not authenticated via Clerk, THEN THE Portal_API SHALL return HTTP 401.
4. IF the user does not have a `stripeCustomerId` on their Subscription record, THEN THE Portal_API SHALL return HTTP 400 with the message `"No billing account found. Please subscribe to a plan first."`.
5. THE Billing_Page SHALL display a "Manage billing" button that calls `/api/billing/portal` and redirects the user to the returned portal URL.
6. THE Billing_Page SHALL display the user's current plan name, billing period end date, and subscription status (ACTIVE, PAST_DUE, CANCELED, TRIALING).
7. WHEN the subscription `status` is PAST_DUE, THE Billing_Page SHALL display a prominent warning banner with the message directing the user to update their payment method via the portal.

---

### Requirement 7: Plan Upgrade and Downgrade Logic

**User Story:** As a subscriber, I want plan changes to take effect correctly and immediately, so that I gain or lose access to features and quotas in line with my new plan.

#### Acceptance Criteria

1. WHEN a user upgrades from FREE to PRO or TEAM via Stripe Checkout, THE Billing_System SHALL update the User's `plan` field to the new PlanType within 30 seconds of the `checkout.session.completed` webhook being received.
2. WHEN a user changes between PRO and TEAM plans via the Stripe Billing Portal, THE Billing_System SHALL update the User's `plan` field within 30 seconds of the `customer.subscription.updated` webhook being received.
3. WHEN a subscription is canceled (either immediately or at period end), THE Billing_System SHALL downgrade the User's `plan` to FREE upon receiving the `customer.subscription.deleted` event.
4. WHEN `cancelAtPeriodEnd` is set to `true` on the Subscription record, THE Billing_Page SHALL display a notice stating the subscription will end on `currentPeriodEnd` and SHALL offer a "Resume subscription" action via the billing portal.
5. WHEN a user is downgraded to FREE and their current resource counts exceed FREE plan limits (e.g., more than 1 project, more than 1 API key), THE Billing_System SHALL NOT automatically delete those resources; instead, THE Billing_Page SHALL display a warning listing the over-limit resources and prompting the user to reduce them.
6. THE Billing_System SHALL invalidate the Plan_Guard's Redis cache for the affected user immediately after any plan change is applied to the database.

---

### Requirement 8: Billing Dashboard Page

**User Story:** As a user, I want a billing page in my dashboard, so that I can see my current plan, usage against quota, and available upgrade options.

#### Acceptance Criteria

1. THE Billing_Page SHALL display the user's current PlanType, monthly price, and a list of included features sourced from the PlanLimit record.
2. THE Billing_Page SHALL display a usage summary showing tokens used today vs. `maxTokensPerDay` and tokens used this month vs. `maxTokensPerMonth`, expressed as both a number and a percentage progress bar.
3. WHEN the user's plan is FREE, THE Billing_Page SHALL display upgrade cards for PRO and TEAM plans with their prices and key differentiating features.
4. WHEN the user's plan is PRO, THE Billing_Page SHALL display an upgrade card for the TEAM plan and a "Manage billing" button for the portal.
5. WHEN the user's plan is TEAM or ENTERPRISE, THE Billing_Page SHALL display only the "Manage billing" button.
6. THE Billing_Page SHALL be available at `app/[locale]/(dashboard)/billing/page.tsx` and SHALL support both `en` and `fr` locales via `next-intl`, with translation files at `messages/en/billing.json` and `messages/fr/billing.json`.
7. THE Billing_Page SHALL be protected by Clerk authentication; unauthenticated requests SHALL be redirected to `/sign-in`.

---

### Requirement 9: Security and Environment Configuration

**User Story:** As a platform operator, I want all Stripe credentials managed via environment variables and all webhook payloads verified, so that the billing system is secure against spoofed events and credential leakage.

#### Acceptance Criteria

1. THE Billing_System SHALL read `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_TEAM_PRICE_ID`, `STRIPE_PRO_PRICE_ID_YEARLY`, and `STRIPE_TEAM_PRICE_ID_YEARLY` exclusively from environment variables; none of these values SHALL be hardcoded in source code.
2. THE Webhook_Handler SHALL reject any request where the `stripe-signature` header is absent or invalid, returning HTTP 400.
3. THE Checkout_API and Portal_API SHALL only be callable from authenticated sessions; all Stripe API calls SHALL be made server-side only, never from client-side code.
4. THE Billing_System SHALL never log or store raw Stripe secret keys, webhook secrets, or full card numbers in any log, database field, or audit entry.
5. THE Billing_System SHALL store only the Stripe customer ID and subscription ID in the database; all sensitive payment data remains exclusively within Stripe's infrastructure.

---

### Requirement 10: Transactional Billing Emails

**User Story:** As a user, I want to receive timely email notifications about my subscription activity, so that I am always informed about charges, failures, and upcoming renewals.

#### Acceptance Criteria

1. WHEN a `checkout.session.completed` webhook event is received and the Subscription status becomes ACTIVE, THE Billing_System SHALL send an upgrade confirmation email to the user via `lib/resend.ts` using a React Email template at `components/emails/billing-upgrade.tsx`.
2. WHEN an `invoice.payment_succeeded` webhook event is received, THE Billing_System SHALL send a payment receipt email to the user containing the invoice amount, date, and a link to the Stripe-hosted invoice PDF.
3. WHEN an `invoice.payment_failed` webhook event is received, THE Billing_System SHALL send a payment failed alert email to the user containing a direct link to the Stripe Billing Portal to update their payment method.
4. WHEN a BullMQ scheduled job runs and a user's `currentPeriodEnd` is within 7 days of the current date, THE Billing_System SHALL send a renewal reminder email to the user stating the renewal date and amount.
5. WHEN a `customer.subscription.deleted` event is received and the user is downgraded to FREE, THE Billing_System SHALL send a plan downgrade notification email to the user confirming the cancellation and listing the features they will lose.
6. THE Billing_System SHALL use the existing `lib/resend.ts` singleton and React Email template pattern (matching `components/emails/user-welcome.tsx`) for all billing email templates.
7. IF an email send operation fails, THEN THE Billing_System SHALL log the error to the console and to Sentry but SHALL NOT block the webhook response or throw an unhandled exception.

---

### Requirement 11: Usage-Based Add-On Billing

**User Story:** As a Pro or Team plan user, I want to continue using the platform beyond my monthly token limit with automatic overage billing, so that my workflows are never hard-blocked mid-month.

#### Acceptance Criteria

1. WHEN a PRO or TEAM user's monthly token consumption exceeds their `maxTokensPerMonth` limit, THE Plan_Guard SHALL NOT hard-block the request; instead, THE Billing_System SHALL create a Stripe usage record for the overage tokens via `stripe.subscriptionItems.createUsageRecord`.
2. THE Billing_System SHALL calculate overage in tranches of 10,000,000 tokens beyond the plan limit and bill each tranche at the configured overage price via a Stripe metered billing price attached to the subscription.
3. WHEN a FREE plan user's monthly token consumption reaches `maxTokensPerMonth`, THE Plan_Guard SHALL hard-block the request and return HTTP 429 with `{ error: "quota_exceeded" }` as defined in Requirement 5.
4. THE Billing_Page SHALL display the current overage token count and the estimated overage cost for the current billing period for PRO and TEAM users.
5. THE Billing_System SHALL treat ENTERPRISE plan users as having no overage limit; THE Plan_Guard SHALL return `{ allowed: true }` for all token quota checks for ENTERPRISE users.
6. THE Billing_System SHALL store the Stripe metered billing subscription item ID in the Subscription record as `stripeMeteredItemId` for use when creating usage records.

---

### Requirement 12: Contextual In-App Upsell

**User Story:** As a user approaching my quota limit, I want to see a contextual upgrade prompt in the dashboard, so that I can upgrade before being blocked.

#### Acceptance Criteria

1. WHEN a user's daily OR monthly token consumption reaches 80% of their respective `maxTokensPerDay` or `maxTokensPerMonth` limit, THE Billing_System SHALL display a non-blocking banner in the dashboard with an upgrade CTA identifying the specific quota that was hit and the next plan's limit.
2. WHEN a FREE user's token consumption reaches 100% of their limit and they are hard-blocked, THE Billing_System SHALL display a modal with an upgrade CTA that cannot be dismissed without the user either upgrading or waiting for the quota reset; the modal SHALL identify the specific quota hit and the next plan's limit.
3. THE Billing_System SHALL track upsell banner impressions in Upstash Redis using the key pattern `upsell:{userId}:{quotaType}:{date}` with a TTL of 86400 seconds (24 hours) to prevent showing the same banner more than once per day per user per quota type.
4. THE upsell banner and modal copy SHALL be contextual: WHEN the daily quota is hit, THE Billing_System SHALL display the daily limit and the next plan's daily limit; WHEN the monthly quota is hit, THE Billing_System SHALL display the monthly limit and the next plan's monthly limit.
5. THE upsell components SHALL use the `cta-accent` button variant for the upgrade CTA and SHALL link to `/billing`.

---

### Requirement 13: Trial Period

**User Story:** As a new user, I want a 14-day free trial of the Pro plan, so that I can evaluate Pro features before committing to a paid subscription.

#### Acceptance Criteria

1. WHEN a new user completes sign-up, THE Billing_System SHALL automatically create a Stripe subscription with `trial_period_days: 14` for the PRO plan price, requiring no credit card during the trial period.
2. WHILE a user's Subscription `status` is TRIALING, THE Billing_System SHALL grant the user access to all PRO plan features as defined in the PlanLimit record for PRO.
3. THE Billing_Page SHALL display the trial status with the number of days remaining when the Subscription `status` is TRIALING.
4. WHEN a `customer.subscription.trial_will_end` webhook event is received (fired by Stripe 3 days before trial end), THE Webhook_Handler SHALL send a trial ending reminder email to the user and SHALL log an audit entry with action `"billing.trial_ending"`.
5. WHEN a trial ends and the user has not added a payment method, THE Webhook_Handler SHALL handle the resulting `customer.subscription.deleted` or `customer.subscription.updated` event and SHALL downgrade the user's `plan` to FREE.
6. THE Webhook_Handler SHALL handle the `customer.subscription.updated` event where `status` transitions to `trialing` and SHALL set the User's `plan` to PRO and the Subscription `status` to TRIALING.

---

### Requirement 14: Invoice History

**User Story:** As a paying subscriber, I want to view my invoice history directly in the dashboard, so that I can download receipts without navigating to the Stripe portal.

#### Acceptance Criteria

1. THE Billing_Page SHALL display a list of the last 12 invoices for the current user, fetched server-side via `stripe.invoices.list({ customer: stripeCustomerId, limit: 12 })`.
2. WHEN rendering the invoice list, THE Billing_Page SHALL display for each invoice: the invoice date, the amount due (formatted in the invoice currency), the status (`paid`, `open`, or `void`), and a download link to the Stripe-hosted PDF URL (`invoice.invoice_pdf`).
3. THE invoice list SHALL be rendered inline within the Billing_Page without requiring navigation to the Stripe portal or any other page.
4. WHEN the user does not have a `stripeCustomerId` on their Subscription record, THE Billing_Page SHALL not render the invoice list section.
5. IF the Stripe API call to fetch invoices fails, THEN THE Billing_Page SHALL display an error message and SHALL NOT throw an unhandled exception.

---

### Requirement 15: Additional Seats (Team Plan)

**User Story:** As a Team plan administrator, I want to add members beyond the included 20 seats with automatic billing, so that my team can grow without manual plan negotiations.

#### Acceptance Criteria

1. THE Team plan SHALL include up to 20 members at the base price of €99/month; each additional member beyond 20 SHALL be billed at €15/user/month via a Stripe subscription quantity update.
2. WHEN a Team plan user adds a team member that causes the total member count to exceed 20, THE Billing_System SHALL call `stripe.subscriptions.update({ quantity: totalMembersAbove20 })` on the subscription's seat add-on item to reflect the new billable seat count.
3. WHEN a Team plan user removes a team member that causes the total member count to drop to or below 20, THE Billing_System SHALL call `stripe.subscriptions.update({ quantity: 0 })` to remove the overage seat charge.
4. THE Billing_Page SHALL display the current seat count, the number of included seats (20), and the calculated cost of any additional seats for Team plan users.
5. THE seat quantity update SHALL take effect immediately via `stripe.subscriptions.update` with `proration_behavior: 'always_invoice'` so the user is billed or credited at the time of the change.
6. THE Billing_System SHALL store the Stripe seat add-on subscription item ID in the Subscription record as `stripeSeatsItemId` for use when updating seat quantity.

---

### Requirement 16: Admin Billing Dashboard

**User Story:** As a platform administrator, I want a billing overview page in the admin panel, so that I can monitor subscription health, MRR, and churn without querying the database directly.

#### Acceptance Criteria

1. THE Billing_System SHALL provide an admin page at `app/[locale]/(admin)/admin/billing/page.tsx` protected by the existing admin RBAC role check.
2. THE admin billing page SHALL display the count of active subscriptions grouped by PlanType (FREE, PRO, TEAM, ENTERPRISE), fetched from the Subscription table in the database.
3. THE admin billing page SHALL display the Monthly Recurring Revenue (MRR), calculated as the sum of monthly prices for all ACTIVE and TRIALING subscriptions, sourced from the Plan model's `price` field in the database.
4. THE admin billing page SHALL display the last 20 billing-related AuditLog entries (where `action` starts with `"billing."`), showing the action, user ID, and timestamp.
5. THE admin billing page SHALL display the churn rate for the last 30 days, calculated as: (count of Subscriptions with `canceledAt` in the last 30 days) / (total Subscription count) × 100, expressed as a percentage.
6. THE admin billing page SHALL fetch all data from the Prisma database; THE Billing_System SHALL NOT call the Stripe API directly from the admin billing page.
7. THE admin billing page SHALL support both `en` and `fr` locales via `next-intl`.

---

### Requirement 17: GateCtr Webhook Events for Billing

**User Story:** As a developer using GateCtr's Webhooks Engine, I want billing plan changes to fire webhook events to my configured endpoints, so that I can automate workflows triggered by subscription changes.

#### Acceptance Criteria

1. WHEN a user's plan changes due to an upgrade, THE Billing_System SHALL fire a `billing.plan_upgraded` webhook event to all of the user's configured webhook endpoints via the existing Webhooks Engine (`lib/webhooks.ts`).
2. WHEN a user's plan changes due to a downgrade or cancellation, THE Billing_System SHALL fire a `billing.plan_downgraded` webhook event to all of the user's configured webhook endpoints.
3. WHEN a new trial subscription is created for a user, THE Billing_System SHALL fire a `billing.trial_started` webhook event to all of the user's configured webhook endpoints.
4. WHEN a `customer.subscription.trial_will_end` event is received, THE Billing_System SHALL fire a `billing.trial_ending` webhook event to all of the user's configured webhook endpoints.
5. WHEN an `invoice.payment_failed` event is received, THE Billing_System SHALL fire a `billing.payment_failed` webhook event to all of the user's configured webhook endpoints.
6. THE webhook payload for all billing events SHALL follow the existing GateCtr webhook payload format:
   ```json
   {
     "event": "billing.plan_upgraded",
     "project_id": "<userId>",
     "timestamp": "<ISO8601>",
     "data": {
       "previous_plan": "FREE",
       "new_plan": "PRO",
       "subscription_id": "<stripeSubscriptionId>"
     }
   }
   ```
7. IF the user has no configured webhook endpoints, THEN THE Billing_System SHALL skip the webhook dispatch silently without logging an error.

---

### Requirement 18: Annual Billing Plans

**User Story:** As a user, I want the option to pay annually at a discounted rate, so that I can reduce my subscription cost by committing to a yearly plan.

#### Acceptance Criteria

1. THE Billing_System SHALL support two billing intervals for PRO and TEAM plans: `'monthly'` and `'yearly'`.
2. THE annual prices SHALL be: PRO at €290/yr (~17% discount vs €348/yr monthly equivalent) and TEAM at €990/yr (~17% discount vs €1,188/yr monthly equivalent).
3. THE `Plan` model already has `stripePriceIdYearly` — THE Billing_System SHALL populate this field for PRO and TEAM plans via `prisma/seed.ts`, reading values from `STRIPE_PRO_PRICE_ID_YEARLY` and `STRIPE_TEAM_PRICE_ID_YEARLY` environment variables.
4. THE Checkout_API SHALL accept an optional `interval: 'monthly' | 'yearly'` parameter in the POST body (defaulting to `'monthly'`); WHEN `interval` is `'yearly'`, THE Checkout_API SHALL use `stripePriceIdYearly` instead of `stripePriceIdMonthly`.
5. IF `interval` is `'yearly'` and `stripePriceIdYearly` is null for the requested plan, THEN THE Checkout_API SHALL return HTTP 400 with the message `"Annual billing is not available for this plan."`.
6. THE Billing_Page SHALL display a monthly/annual toggle above the plan cards; WHEN the user selects annual, THE Billing_Page SHALL show the annual price (e.g., "€290/yr") and a savings badge (e.g., "Save 17%").
7. THE Billing_Page SHALL pass the selected `interval` to the checkout API call when the user clicks an upgrade CTA.
8. THE `Subscription` record's `stripePriceId` field SHALL reflect the actual Stripe price ID used (monthly or yearly), allowing the webhook handler to determine the billing interval from the subscription.
9. THE Billing_Page SHALL display the billing interval (monthly or annual) alongside the subscription status for active subscribers.
