# Changelog

All notable changes to GateCtr are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [4.0.0] — 2026-03-23

### Added

- **In-app notifications** — Bell icon in the dashboard header. Real-time alerts with unread dot, "Mark all read", and empty state. Polling every 30s.
- **API key revoke & delete** — Revoke active keys or permanently delete any key directly from the settings page, with confirmation dialogs.
- **Team avatar in sidebar** — Team switcher now displays the team logo when an `avatarUrl` is set, with initials fallback.
- **Workspace modal z-index fix** — Create Workspace modal no longer renders behind other UI layers.

### Fixed

- TypeScript build error on `api-keys/page.tsx` — `expiresAt` missing from Prisma select fallback type.
- TypeScript error on `settings/team/page.tsx` — `user` property missing from `teamMember.findMany` fallback type.
- Test suite alignment — unit and property-based tests updated to match actual `classifyComplexity`, `estimateTokens`, `GET /integrations`, and ownership guard signatures.

### Infrastructure

- New API routes: `GET /api/v1/notifications`, `PATCH /api/v1/alerts/[id]`, `POST /api/v1/alerts/acknowledge-all`
- `avatarUrl` exposed on `GET /api/v1/teams/active` and `GET /api/v1/teams`

---

## [0.3.0] — 2026-03-21

### Added

- **LLM Gateway** — Single endpoint for OpenAI, Anthropic, Mistral, and Gemini. One URL swap, zero code changes.
- **Budget Firewall** — Hard caps and soft alerts per user and per project. No surprise invoices.
- **Context Optimizer** — Automatic prompt compression. Up to -40% tokens, same output quality.
- **Model Router** — Automatic model selection based on cost and performance per request.
- **Rate Limiting** — Sliding window rate limiter per API key, project, and plan.
- **API Key Management** — Full lifecycle: create, list, revoke. Scoped access (`complete`, `chat`, `read`, `admin`).
- **LLM Provider Keys** — Securely store and manage your OpenAI, Anthropic, Mistral, and Gemini API keys. AES-256-GCM encrypted at rest.
- **Model Catalog** — `GET /api/v1/models` returns all active models with capabilities and pricing.
- **Usage API** — `GET /api/v1/usage` aggregates token usage and cost by model and project for the current month.
- **Budget API** — `POST /api/v1/budget` to configure monthly token and cost limits with alert thresholds.

### Endpoints

| Method   | Endpoint                | Description                             |
| -------- | ----------------------- | --------------------------------------- |
| POST     | `/api/v1/complete`      | LLM text completion (OpenAI-compatible) |
| POST     | `/api/v1/chat`          | LLM chat completion (OpenAI-compatible) |
| GET/POST | `/api/v1/api-keys`      | API key management                      |
| GET/POST | `/api/v1/provider-keys` | LLM provider key management             |
| GET/POST | `/api/v1/budget`        | Budget configuration                    |
| GET      | `/api/v1/models`        | Active model catalog                    |
| GET      | `/api/v1/usage`         | Usage and cost aggregates               |

---

## [0.2.0] — 2026-02-14

### Added

- Stripe billing integration — Free, Pro, Team, Enterprise plans
- Plan quota enforcement across all features
- Webhook engine — push events to Slack, Teams, or any URL
- Audit logs — 90-day retention for Team and Enterprise plans
- RBAC — Admin, Manager, Dev, Viewer roles for team workspaces

---

## [0.1.0] — 2026-01-10

### Added

- Clerk authentication — SSO, MFA, OAuth
- Multi-tenant workspace management
- Real-time usage dashboard
- Waitlist and onboarding flow
- Admin panel

---

[0.3.0]: https://github.com/GateCtr/platform/releases/tag/v0.3.0
[0.2.0]: https://github.com/GateCtr/platform/releases/tag/v0.2.0
[0.1.0]: https://github.com/GateCtr/platform/releases/tag/v0.1.0
