# Project Structure

## Root Configuration

- `package.json` - Dependencies and scripts (pnpm workspace)
- `tsconfig.json` - TypeScript config with path aliases (`@/*`)
- `next.config.ts` - Next.js configuration with i18n plugin
- `proxy.ts` - Middleware (Next.js 16 convention) - handles Clerk auth + i18n routing
- `eslint.config.mjs` - ESLint rules
- `postcss.config.mjs` - PostCSS with Tailwind
- `.gitignore` - Git exclusions

## App Directory (Next.js App Router)

```
app/
├── [locale]/                    # Internationalized routes (dynamic locale segment)
│   ├── (marketing)/             # Public marketing pages
│   │   └── waitlist/
│   │       └── page.tsx         # Waitlist page (/waitlist or /fr/waitlist)
│   ├── (auth)/                  # Clerk authentication pages
│   │   ├── sign-in/
│   │   │   └── [[...sign-in]]/
│   │   │       └── page.tsx     # Clerk sign-in
│   │   └── sign-up/
│   │       └── [[...sign-up]]/
│   │           └── page.tsx     # Clerk sign-up
│   ├── (dashboard)/             # Main user application (protected)
│   │   ├── layout.tsx           # Dashboard layout
│   │   ├── page.tsx             # Dashboard home
│   │   ├── analytics/           # Token analytics
│   │   │   └── page.tsx
│   │   ├── projects/            # LLM project management
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   ├── api-keys/            # API key management
│   │   │   └── page.tsx
│   │   ├── budget/              # Budget configuration
│   │   │   └── page.tsx
│   │   ├── webhooks/            # Webhook configuration
│   │   │   └── page.tsx
│   │   └── billing/             # Stripe billing & plans
│   │       └── page.tsx
│   ├── (admin)/                 # Admin-only area (RBAC protected)
│   │   └── admin/
│   │       ├── waitlist/
│   │       │   └── page.tsx     # Waitlist management
│   │       ├── users/
│   │       │   └── page.tsx
│   │       ├── plans/
│   │       │   └── page.tsx
│   │       ├── feature-flags/
│   │       │   └── page.tsx
│   │       ├── audit-logs/
│   │       │   └── page.tsx
│   │       └── system/
│   │           └── page.tsx
│   ├── layout.tsx               # Locale layout (NextIntlClientProvider)
│   └── page.tsx                 # Localized home page
├── api/                         # API routes (NOT localized)
│   ├── v1/                      # Public SDK API endpoints
│   │   ├── complete/
│   │   │   └── route.ts         # LLM completion
│   │   ├── chat/
│   │   │   └── route.ts         # Chat endpoints
│   │   ├── usage/
│   │   │   └── route.ts         # Usage stats
│   │   ├── budget/
│   │   │   └── route.ts         # Budget management
│   │   └── webhooks/
│   │       └── route.ts         # Webhook management
│   ├── waitlist/
│   │   ├── route.ts             # Waitlist join (POST/GET)
│   │   └── invite/
│   │       └── route.ts         # Batch invite (POST)
│   └── webhooks/
│       ├── clerk/
│       │   └── route.ts         # Clerk sync webhooks
│       └── stripe/
│           └── route.ts         # Stripe event webhooks
├── layout.tsx                   # Root layout (fonts, metadata, html tag)
├── globals.css                  # Global styles (Tailwind, theme variables)
└── favicon.ico
```

### Key Points

1. **`[locale]/` folder**: All user-facing pages go here for i18n support
2. **Route groups**: `(marketing)`, `(auth)`, `(dashboard)`, `(admin)` organize without affecting URLs
3. **API routes**: Stay at `/api/*` - NOT localized
4. **Two layouts**:
   - `app/layout.tsx` - Root (fonts, metadata)
   - `app/[locale]/layout.tsx` - Locale provider (i18n)

### URL Examples

```
English (default - no prefix):
/                           → app/[locale]/page.tsx
/waitlist                   → app/[locale]/(marketing)/waitlist/page.tsx
/dashboard                  → app/[locale]/(dashboard)/page.tsx
/admin/waitlist             → app/[locale]/(admin)/admin/waitlist/page.tsx

French (with /fr/ prefix):
/fr                         → app/[locale]/page.tsx
/fr/waitlist                → app/[locale]/(marketing)/waitlist/page.tsx
/fr/dashboard               → app/[locale]/(dashboard)/page.tsx
/fr/admin/waitlist          → app/[locale]/(admin)/admin/waitlist/page.tsx

API (not localized):
/api/waitlist               → app/api/waitlist/route.ts
/api/v1/complete            → app/api/v1/complete/route.ts
```

## Supporting Directories

```
messages/                 # i18n translations (modular structure)
├── en/                   # English translations
│   ├── common.json       # Shared translations (nav, footer, actions)
│   ├── waitlist.json     # Waitlist page translations
│   └── admin.json        # Admin panel translations
└── fr/                   # French translations
    ├── common.json
    ├── waitlist.json
    └── admin.json

i18n/                     # Internationalization config
├── routing.ts            # Locale routing configuration
└── request.ts            # Message loading logic

components/
├── ui/                   # Radix UI + shadcn components
├── dashboard/            # Dashboard-specific components
├── admin/                # Admin panel components
├── charts/               # Recharts visualizations
├── emails/               # React Email templates
└── language-switcher.tsx # Language selection component

lib/
├── prisma.ts             # Prisma client singleton
├── redis.ts              # Redis client
├── stripe.ts             # Stripe client
├── resend.ts             # Resend email client
├── optimizer.ts          # Context optimization logic
├── router.ts             # Model routing logic
├── firewall.ts           # Budget firewall logic
├── webhooks.ts           # Webhook engine
├── permissions.ts        # RBAC permissions
├── api-auth.ts           # API authentication
├── audit.ts              # Audit logging
├── features.ts           # Feature flags
└── llm/                  # LLM provider integrations
    ├── openai.ts
    ├── anthropic.ts
    └── mistral.ts

prisma/
├── schema.prisma         # Database schema
└── migrations/           # Migration history

workers/
├── webhook.worker.ts     # Background webhook processing
└── email.worker.ts       # Background email processing

sdk/                      # SDK package for Node.js/Python

tests/
├── unit/                 # Vitest unit tests
├── integration/          # Integration tests
└── e2e/                  # Playwright E2E tests

docs/                     # Platform documentation PDFs

public/                   # Static assets (images, icons)
```

## Internationalization (i18n)

- Supported locales: `en` (English - default), `fr` (French)
- URL structure:
  - English (default): `/waitlist` (no prefix)
  - French: `/fr/waitlist` (with prefix)
- Strategy: `localePrefix: 'as-needed'` - cleaner URLs for default locale
- Automatic locale detection from browser, cookie, or URL
- Locale persistence via `NEXT_LOCALE` cookie
- Modular translations organized by feature/page in `messages/[locale]/`
- API routes are NOT localized (remain at `/api/*`)

### Creating Localized Pages

All pages with user-facing content MUST:

1. Be placed in `app/[locale]/` directory
2. Use `useTranslations()` hook from `next-intl`
3. Have translation files in both `messages/en/` and `messages/fr/`
4. Include `LanguageSwitcher` component

See `.kiro/steering/i18n.md` for complete guidelines.

## Route Groups

Next.js route groups (folders in parentheses) organize routes without affecting URL structure:

- `[locale]` - Dynamic locale segment for internationalization (required for all user pages)
- `(marketing)` - Public marketing pages (landing, waitlist)
- `(auth)` - Authentication flows (sign-in, sign-up)
- `(dashboard)` - Protected user dashboard
- `(admin)` - Admin-only protected area

### Route Group Examples

```typescript
// File: app/[locale]/(marketing)/waitlist/page.tsx
// URL: /waitlist (English) or /fr/waitlist (French)

// File: app/[locale]/(dashboard)/projects/page.tsx
// URL: /projects (English) or /fr/projects (French)

// File: app/[locale]/(admin)/admin/users/page.tsx
// URL: /admin/users (English) or /fr/admin/users (French)
```

## Path Aliases

TypeScript path alias `@/*` maps to project root, enabling clean imports:

```typescript
// Components
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";

// Libraries
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";

// i18n
import { Link, useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";

// Types
import type { User } from "@/types/user";
```

### Import Rules

1. **Navigation**: Use `@/i18n/routing` for `Link` and `useRouter` (locale-aware)
2. **Translations**: Always use `useTranslations()` from `next-intl`
3. **Components**: Import from `@/components/`
4. **Never** use relative imports for shared code (`../../../lib/utils`)

## Naming Conventions

- **Files**: kebab-case for components (`user-profile.tsx`)
- **Components**: PascalCase (`UserProfile`)
- **Utilities**: camelCase (`getUserData`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_TOKEN_LIMIT`)
- **Types/Interfaces**: PascalCase with descriptive names
- **Middleware**: `proxy.ts` (Next.js 16 convention)
- **Translation files**: `feature.json` (e.g., `waitlist.json`, `admin.json`)

## Internationalization (i18n) - CRITICAL RULES

**ALWAYS follow these rules when creating pages or components:**

1. ✅ **Create translation files for BOTH languages** (`messages/en/` and `messages/fr/`)
2. ✅ **Use `useTranslations()` hook** - Never hardcode user-facing text
3. ✅ **Update `i18n/request.ts`** to import new translation files
4. ✅ **Test both languages** before committing (`/path` and `/fr/path`)

See `.kiro/steering/i18n.md` for complete guidelines.
