# Technology Stack

## Core Framework

- **Next.js 16.1.6** with App Router
- **React 19.2.3**
- **TypeScript 5** (strict mode enabled)
- **Node.js 20+** required
- **next-intl 4.8.3** for internationalization (i18n)

## Styling

- **Tailwind CSS 4** with PostCSS
- **CSS Variables** for theming (light/dark mode)
- **Geist Sans & Geist Mono** fonts
- **next-themes** for theme management
- Utility libraries: clsx, tailwind-merge, class-variance-authority

## Database & Storage

- **PostgreSQL 18** via Neon Serverless
- **Prisma 7.5.0** as ORM
- **Upstash Redis** for caching
- **BullMQ + IORedis** for job queues
- **Cloudflare R2/S3** for file storage

## Authentication & Security

- **Clerk** for authentication (SSO, MFA, RBAC, OAuth, JWT)
- AES encryption for sensitive data
- TLS for all communications
- Multi-tenant isolation

## Integrations

- **Stripe** for payments
- **Resend** with React Email for transactional emails
- **Sentry** for error monitoring and performance tracking

## UI Components

- **Radix UI** primitives (Avatar, Dialog, Dropdown, Progress, Select, Tabs)
- **Lucide React** for icons
- **TanStack Query** (React Query) for data fetching
- **TanStack Table** for data tables
- **Recharts** for charts and visualizations
- **Zustand** for state management

## Development Tools

- **pnpm** as package manager (required)
- **ESLint** with Next.js config and Prettier
- **Husky** for Git hooks
- **lint-staged** for pre-commit linting
- **tsx** for TypeScript execution

## Testing

- **Vitest** for unit tests with Coverage V8
- **Playwright** for E2E tests
- **React Testing Library** with Jest DOM
- **jsdom** for DOM testing environment

## Common Commands

```bash
# Development
pnpm dev              # Start dev server (localhost:3000)
pnpm build            # Build for production
pnpm start            # Start production server
pnpm lint             # Run ESLint

# Database
pnpm prisma migrate dev       # Run migrations in dev
pnpm prisma generate          # Generate Prisma client
pnpm prisma studio            # Open Prisma Studio

# Testing
pnpm test                     # Run unit tests
pnpm test:e2e                 # Run E2E tests
pnpm test:coverage            # Generate coverage report
```

## Code Quality Standards

- TypeScript strict mode enforced
- ESLint + Prettier for consistent formatting
- Conventional Commits for Git messages
- Pre-commit hooks via Husky + lint-staged
