# Changelog

All notable changes to GateCtr are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v0.1.0-onboarding] — 2026-03-20

### Added

- 3-step onboarding flow: Workspace → LLM Provider → Budget
- Step 1: workspace creation with `usageType` (solo / team / enterprise)
- Step 2: LLM provider connection (OpenAI, Anthropic, Mistral, Gemini) with AES-encrypted key storage
- Step 3: Budget Firewall setup — monthly token limit, alert threshold, hard stop toggle
- Server actions: `createWorkspace()`, `connectProvider()`, `setupBudget()`
- `lib/encryption.ts` — AES-256 encrypt/decrypt for LLM API keys
- Onboarding settings page — edit workspace name and provider keys post-onboarding
- Admin panel: onboarding status column + manual reset action on users page
- Progress indicator (Step X of 3) with step labels
- Skip option on provider step with warning copy
- Translation files: `messages/en/onboarding.json`, `messages/fr/onboarding.json`
- Full unit test coverage for all 3 steps and server actions

---

## [v0.1.0-billing] — 2026-03-20

### Added

- Stripe Checkout integration — hosted payment page per plan (Pro, Team, Enterprise)
- Stripe Customer Portal — self-serve subscription management and cancellation
- Stripe webhook handler — handles `checkout.session.completed`, `customer.subscription.*`, `invoice.*`
- Admin billing panel — list all subscriptions, filter by plan/status, view details
- Admin subscription detail page — customer info, plan, status, Stripe links
- Admin coupon management — create and list discount coupons via Stripe API
- Admin refund action — issue full or partial refunds from the admin panel
- Plan guard middleware — blocks access to features above the user's current plan
- Seat overage detection — alerts when Team plan exceeds included seats
- Upsell banners — contextual upgrade prompts triggered by plan limits
- Transactional emails: subscription confirmation, payment failed, cancellation
- `lib/stripe.ts` — lazy singleton client (no module-level instantiation)
- Translation files: `messages/en/billing.json`, `messages/fr/billing.json`

### Infrastructure

- CI/CD pipeline with GitHub Actions (lint, test, build, Docker, deploy)
- Docker multi-stage build with standalone Next.js output
- Husky pre-commit hooks with lint-staged
- Dashboard sidebar redesign — active states, team switcher, user menu
- Dashboard header — breadcrumb, token usage bar, upgrade CTA

---

## [163894f] — Initial commit

- GateCtr Next.js project scaffold (Next.js 16, React 19, TypeScript 5, Tailwind 4)
- Clerk authentication, Prisma + Neon PostgreSQL, Upstash Redis
- next-intl i18n (EN/FR), Sentry error monitoring
