# GateCtr

Hub middleware universel pour contrôler, optimiser et sécuriser vos appels API vers les LLMs.

## À propos

GateCtr résout le problème croissant des équipes qui intègrent des LLMs : aucune visibilité, aucun contrôle et aucune optimisation sur leurs appels API. Les coûts explosent, les budgets dérapent, et les outils de monitoring natifs restent insuffisants.

### Problèmes résolus

- ✅ Coûts LLM incontrôlables et imprévisibles
- ✅ Aucune visibilité sur la consommation de tokens
- ✅ Prompts non optimisés → réponses coûteuses
- ✅ Pas de routage intelligent entre providers
- ✅ Alertes et reporting absents ou manuels
- ✅ Sécurité des clés API insuffisante
- ✅ Pas d'intégration avec outils BI/ERP/Slack

### Solutions apportées

- **Budget Firewall**: Limites par projet/utilisateur
- **Dashboard temps réel**: Alertes webhooks automatisées
- **Context Optimizer**: Réduction de -40% des tokens
- **Model Router**: Sélection automatique du meilleur modèle
- **Webhooks automatisés**: Vers tous vos outils
- **Sécurité renforcée**: Chiffrement AES · TLS · Isolation multi-tenant
- **Connecteurs natifs**: Slack, Teams, ERP, BI

### Proposition de valeur

GateCtr agit comme un hub middleware universel entre vos applications et les fournisseurs LLM.

- ⚡ Zéro changement de votre clé API
- 🚀 Intégration en moins de 5 minutes
- 💰 Économies immédiates sur vos coûts tokens

## Architecture

GateCtr est une plateforme SaaS qui s'intercale entre vos applications/agents IA et les fournisseurs LLM (OpenAI, Anthropic, Mistral, Gemini…). Elle intercepte chaque requête pour l'optimiser, la sécuriser, la router et l'analyser — sans jamais stocker vos données sensibles.

### Flux de traitement

```
App/User/Agent IA → GateCtr Core → LLM Provider
                    ↓
            Context Optimizer
            Model Router
                    ↓
        Response + Analytics + Webhooks
```

Chaque requête traverse GateCtr avant d'atteindre le fournisseur LLM. La réponse revient enrichie d'analytics.

### Pipeline de traitement

| Étape           | Description                                                        | Module               |
| --------------- | ------------------------------------------------------------------ | -------------------- |
| 1. Envoi        | L'app/agent envoie un prompt via SDK ou API                        | SDK / API Layer      |
| 2. Optimisation | Compression du contexte, nettoyage du prompt, réduction des tokens | Context Optimizer    |
| 3. Contrôle     | Vérification des limites budget/tokens, validation sécurité        | Budget Firewall      |
| 4. Routage      | Sélection du modèle LLM optimal (coût + performance)               | Model Router         |
| 5. Exécution    | Envoi de la requête au provider LLM avec la clé API utilisateur    | LLM Provider         |
| 6. Analytics    | Logging de la réponse, calcul consommation, déclenchement webhooks | Analytics + Webhooks |

### Modules principaux

#### SDK / API Layer

Interface principale d'entrée. Envoi des prompts, configuration des clés API, options de workflow.

- Compatible Node.js, Python, REST
- Intégration avec toutes apps SaaS ou agents IA
- Setup en 5 minutes

#### Context Optimizer

Compression intelligente des prompts et gestion de l'historique conversationnel.

- Réduction jusqu'à -40% des tokens
- Prompt rewriting automatique
- Context pruning intelligent
- Suppression des redondances

#### Cost & Budget Firewall

Définition de limites de tokens et budget par utilisateur, workflow ou projet.

- Hard caps (blocage automatique)
- Soft alerts (notifications)
- Limites par utilisateur/projet
- Prévention des coûts excessifs

#### Model Router & Fallback

Sélection automatique du fournisseur LLM le plus adapté selon le coût et la performance.

- Support multi-provider
- Auto-fallback en cas d'erreur
- Cost scoring intelligent
- Fallback automatique si indisponibilité

#### Token & Usage Analytics

Dashboard temps réel de la consommation de tokens par user, projet ou endpoint.

- Monitoring en temps réel
- Alertes configurables
- Reporting exportable
- Historique complet pour audit

#### Security Layer

Chiffrement et sécurisation de toutes les communications.

- Chiffrement AES des données en transit et au repos
- TLS obligatoire sur toutes les connexions
- Isolation multi-tenant stricte
- Validation et sanitization de tous les inputs

#### Webhooks Engine

Notifications automatisées configurables sur événements critiques.

- Dépassement de budget
- Pics de consommation
- Erreurs de requête ou seuils définis
- Intégrations: Slack, Teams, Email, ERP, BI

#### RBAC & Multi-User

Gestion des rôles et permissions pour environnements entreprise.

- Rôles: Admin, Manager, Developer, Viewer
- Audit logs complets
- Segmentation par équipe, département ou projet
- Contrôle d'accès granulaire

## Technologies

### Stack principal

- **Framework**: Next.js 16.1.6 avec App Router
- **Runtime**: React 19.2.3
- **Langage**: TypeScript 5
- **Styling**: Tailwind CSS 4

### Infrastructure & Base de données

- **Base de données**: PostgreSQL 18 (ACID compliance, JSON support, performances élevées)
- **ORM**: Prisma 7.5.0
- **Hosting DB**: Neon Serverless PostgreSQL (branching, autoscaling)
- **Cache**: Upstash Redis
- **Queue**: BullMQ avec IORedis
- **File Storage**: Cloudflare R2 / S3 (exports, logs, artefacts analytics)

### Authentification & Sécurité

- **Auth**: Clerk (SSO, MFA, RBAC, OAuth, JWT, webhooks)
- **Sessions**: Clerk Sessions + JWT (rotation automatique des tokens)
- **Chiffrement**: AES + TLS
- **Isolation**: Multi-tenant stricte

### Intégrations & Services

- **Paiements**: Stripe
- **Email**: Resend avec React Email
- **Monitoring**: Sentry
- **Analytics**: Custom analytics engine
- **Webhooks**: Engine personnalisé pour Slack, Teams, ERP, BI

### UI & Composants

- **UI Library**: Radix UI (Avatar, Dialog, Dropdown, Progress, Select, Tabs)
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Tables**: TanStack Table
- **Charts**: Recharts
- **Theming**: next-themes
- **Utilities**: clsx, tailwind-merge, class-variance-authority

### Développement & Tests

## Prérequis

- Node.js 20+
- pnpm (gestionnaire de paquets)
- PostgreSQL
- Redis

## Installation

### Prérequis

- Node.js 20+
- pnpm (gestionnaire de paquets)
- PostgreSQL 18 (ou compte Neon)
- Redis (ou compte Upstash)
- Docker (optionnel)

### Setup initial

```bash
# Cloner le dépôt
git clone https://github.com/your-org/gatectr.git
cd gatectr

# Installer les dépendances
pnpm install

# Configurer les variables d'environnement
cp .env.example .env.local

# Initialiser la base de données
pnpm prisma migrate dev

# Lancer le serveur de développement
pnpm dev
```

### Configuration Git

```bash
# Initialiser le dépôt
git init && git branch -M main

# Ajouter au .gitignore
echo ".env.local
.env.*.local
.DS_Store
/coverage
playwright-report" >> .gitignore

# Premier commit
git add . && git commit -m "chore: init GateCtr Next.js project"

# Configurer les remotes
git remote add origin https://github.com/your-org/gatectr.git
git push -u origin main

# Créer la branche develop
git checkout -b develop && git push -u origin develop
```

### Convention Conventional Commits

```bash
feat(scope): description     # Nouvelle feature
fix(scope): description      # Bug fix
chore: description          # Tooling/config
docs: description           # Documentation
test: description           # Tests
ci: description             # CI/CD
```

### Docker

```bash
# Développement
docker-compose up -d

# Production
docker build -f docker/Dockerfile -t gatectr:latest .
docker run -p 3000:3000 gatectr:latest
```

## Scripts disponibles

```bash
pnpm dev          # Démarre le serveur de développement
pnpm build        # Compile l'application pour la production
pnpm start        # Démarre le serveur de production
pnpm lint         # Vérifie le code avec ESLint
```

### Développement & Tests

- **Tests unitaires**: Vitest avec Coverage V8
- **Tests E2E**: Playwright
- **Testing Library**: React Testing Library, Jest DOM
- **Linting**: ESLint avec config Next.js et Prettier
- **Git Hooks**: Husky + lint-staged
- **Type Checking**: TypeScript en mode strict
- **Build Tools**: tsx, tsconfig paths

## Structure du projet

```
gatectr/
├── app/                          # Next.js App Router
│   ├── (marketing)/              # Landing, waitlist (public)
│   ├── (auth)/                   # Clerk sign-in/sign-up
│   ├── (dashboard)/              # Application utilisateur
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Overview
│   │   ├── analytics/            # Token analytics
│   │   ├── projects/             # Projets LLM
│   │   ├── api-keys/             # Gestion clés API
│   │   ├── budget/               # Configuration budget
│   │   ├── webhooks/             # Configuration webhooks
│   │   └── billing/              # Plans & Stripe
│   ├── (admin)/                  # Espace admin restreint
│   │   ├── layout.tsx            # Vérification permissions RBAC
│   │   ├── page.tsx              # Super Admin dashboard
│   │   ├── users/
│   │   ├── plans/
│   │   ├── feature-flags/
│   │   ├── audit-logs/
│   │   └── system/
│   ├── api/
│   │   ├── v1/                   # SDK public API
│   │   │   ├── complete/
│   │   │   ├── chat/
│   │   │   ├── usage/
│   │   │   ├── budget/
│   │   │   ├── webhooks/
│   │   │   ├── logs/
│   │   │   └── models/
│   │   └── webhooks/
│   │       ├── clerk/            # Sync Clerk → DB
│   │       └── stripe/           # Stripe events
├── components/
│   ├── ui/                       # shadcn/ui components
│   ├── dashboard/
│   ├── admin/
│   ├── charts/
│   └── emails/                   # React Email templates
├── lib/
│   ├── prisma.ts, redis.ts, stripe.ts, resend.ts
│   ├── optimizer.ts, router.ts, firewall.ts, webhooks.ts
│   ├── permissions.ts, api-auth.ts, audit.ts, features.ts
│   └── llm/                      # openai.ts, anthropic.ts, mistral.ts
├── middleware.ts
├── prisma/                       # schema.prisma + migrations/
├── workers/                      # webhook.worker.ts, email.worker.ts
├── sdk/                          # SDK package
├── tests/                        # unit/ integration/ e2e/
├── docker/                       # Dockerfile, Dockerfile.dev, nginx.conf
├── .github/workflows/            # ci.yml, deploy.yml
├── docs/                         # Documentation
└── public/                       # Fichiers statiques
```

## Fonctionnalités principales

### Contrôle des coûts

- Budget Firewall avec limites par projet et utilisateur
- Dashboard temps réel de consommation de tokens
- Alertes automatiques sur dépassement de budget
- Rapports détaillés d'utilisation

### Optimisation

- Context Optimizer pour réduire jusqu'à 40% les tokens
- Model Router pour sélection automatique du meilleur modèle LLM
- Cache intelligent avec Redis pour éviter les appels redondants
- Traitement asynchrone des requêtes avec BullMQ

### Sécurité

- Chiffrement AES des clés API
- Communication TLS sécurisée
- Isolation multi-tenant
- Authentification robuste avec Clerk

### Intégrations

- Webhooks automatisés vers vos outils
- Connecteurs natifs: Slack, Teams, ERP, BI
- API REST compatible avec tous les providers LLM
- Notifications par email avec Resend

### Monitoring

- Suivi en temps réel avec Sentry
- Métriques détaillées de performance
- Logs d'audit complets
- Tableaux de bord personnalisables

## Documentation

Pour plus d'informations sur la plateforme GateCtr, consultez les documents dans le dossier `/docs`:

- GateCtr DevDocs.pdf
- GateCtr DevDocs v2.pdf
- GateCtr Platform Documentation.pdf

## Configuration

Les variables d'environnement nécessaires incluent:

- `DATABASE_URL`: URL de connexion PostgreSQL
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clé publique Clerk
- `CLERK_SECRET_KEY`: Clé secrète Clerk
- `STRIPE_SECRET_KEY`: Clé secrète Stripe
- `UPSTASH_REDIS_URL`: URL Redis Upstash
- `RESEND_API_KEY`: Clé API Resend
- `SENTRY_DSN`: DSN Sentry pour le monitoring

## Développement

Le projet utilise:

- **ESLint** avec configuration Next.js et Prettier
- **Husky** pour les hooks Git
- **lint-staged** pour le linting pré-commit
- **TypeScript** en mode strict

## Tests

```bash
pnpm test              # Lance les tests unitaires avec Vitest
pnpm test:e2e          # Lance les tests E2E avec Playwright
pnpm test:coverage     # Génère le rapport de couverture
```

## Déploiement

L'application peut être déployée sur Vercel ou toute plateforme supportant Next.js:

```bash
pnpm build
pnpm start
```

## Licence

Propriétaire - Tous droits réservés

## Support

Pour toute question ou problème, consultez la documentation dans `/docs` ou contactez l'équipe de développement.

## Authentication & RBAC

GateCtr uses [Clerk](https://clerk.com) for authentication and a custom RBAC system for authorization.

### Required Environment Variables

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
CLERK_WEBHOOK_SECRET="whsec_..."          # From Clerk Dashboard → Webhooks
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/dashboard"

# Upstash Redis (permission caching)
UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-token"
```

### Roles & Permissions

| Role        | Permissions                                                                          |
| ----------- | ------------------------------------------------------------------------------------ |
| SUPER_ADMIN | All permissions                                                                      |
| ADMIN       | users:read/write, analytics:read/export, billing:read/write, system:read, audit:read |
| MANAGER     | analytics:read, users:read, billing:read                                             |
| DEVELOPER   | analytics:read                                                                       |
| VIEWER      | analytics:read                                                                       |
| SUPPORT     | users:read, audit:read                                                               |

New users are assigned the **DEVELOPER** role by default.

### Checking Permissions

**Server components / API routes:**

```typescript
import { requirePermission, requireAdmin } from "@/lib/auth";

// Throws if user lacks permission
await requirePermission("users:read");

// Throws if user is not SUPER_ADMIN or ADMIN
await requireAdmin();
```

**Client components:**

```typescript
import { PermissionGate } from '@/components/auth/permission-gate';
import { RoleGate } from '@/components/auth/role-gate';

<PermissionGate permission="users:read">
  <UserTable />
</PermissionGate>

<RoleGate roles={['SUPER_ADMIN', 'ADMIN']}>
  <AdminPanel />
</RoleGate>
```

**Hooks:**

```typescript
import { useHasPermission, useHasAnyPermission } from "@/hooks/use-permissions";
import { useIsAdmin } from "@/hooks/use-roles";

const canReadUsers = useHasPermission("users:read");
const isAdmin = useIsAdmin();
```

### Clerk Webhook Setup

1. Go to **Clerk Dashboard → Webhooks → Add Endpoint**
2. Set URL to `https://your-domain.com/api/webhooks/clerk`
3. Subscribe to events: `user.created`, `user.updated`, `user.deleted`
4. Copy the **Signing Secret** → set as `CLERK_WEBHOOK_SECRET`

For local development, use the [Clerk CLI](https://clerk.com/docs/testing/webhooks):

```bash
clerk webhooks proxy http://localhost:3000/api/webhooks/clerk
```

### Database Seeding

After running migrations, seed roles and permissions:

```bash
pnpm prisma db seed
```

To verify:

```bash
pnpm prisma studio
# Check the Role, Permission, and RolePermission tables
```

To manually assign a role to a user, see `docs/ASSIGN_ADMIN_ROLE.md`.
