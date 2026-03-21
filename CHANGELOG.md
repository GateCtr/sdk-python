# Changelog

All notable changes to GateCtr are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v0.1.0] — 2026-03-20

### Onboarding

- 3-step onboarding flow: Workspace → LLM Provider → Budget
- Workspace creation with usage type (solo / team / enterprise)
- LLM provider connection — OpenAI, Anthropic, Mistral, Gemini — keys stored encrypted at rest
- Budget Firewall setup — monthly token limit, alert threshold, hard stop toggle
- Settings page to edit workspace name and provider keys after onboarding
- Skip option on provider step with contextual warning
- Progress indicator (Step X of 3) with step labels
- EN/FR translations

### Billing

- Stripe Checkout — hosted payment page for Pro, Team, and Enterprise plans
- Stripe Customer Portal — self-serve subscription management and cancellation
- Webhook handling for subscription lifecycle events (created, updated, canceled, payment failed)
- Transactional emails: subscription confirmation, payment failed, cancellation

### Admin

- Billing panel — list all subscriptions, filter by plan and status
- Subscription detail view — customer info, plan, status, direct Stripe links
- Coupon management — create and list discount coupons
- Refund action — issue full or partial refunds
- Users page — onboarding status column and manual reset action
- Plan guard — blocks access to features above the user's current plan
- Seat overage detection — alerts when Team plan exceeds included seats
- Upsell banners — contextual upgrade prompts triggered by plan limits

### Infrastructure

- CI/CD pipeline with GitHub Actions (lint, test, build, deploy)
- Docker multi-stage build
- Pre-commit hooks with lint-staged
- Dashboard sidebar redesign — active states, team switcher, user menu
- Dashboard header — breadcrumb, token usage bar, upgrade CTA

---

## [v0.0.1] — Initial release

- GateCtr platform scaffold — Next.js 16, React 19, TypeScript 5, Tailwind 4
- Authentication via Clerk (SSO, MFA, OAuth)
- PostgreSQL database with Neon, Redis caching
- EN/FR internationalization, Sentry error monitoring
