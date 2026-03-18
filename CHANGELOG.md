# Changelog - GateCtr

## [Phase 0] - 2026-03-15

### ✅ Implémentation complète de la Phase 0 - Waitlist

#### Base de données

- ✅ Schéma Prisma complet avec 30+ tables
- ✅ Migration initiale appliquée
- ✅ Seed avec plans (FREE, PRO), rôles (6), permissions (47), et providers LLM (3)
- ✅ Configuration Prisma 7 avec `prisma.config.ts`

#### Pages & Interface

- ✅ Page d'accueil avec redirection automatique vers waitlist
- ✅ Page publique d'inscription `/waitlist`
- ✅ Interface admin `/admin/waitlist` avec filtres et pagination
- ✅ Design system complet avec palette GateCtr
- ✅ Typographie configurée (Syne, Inter, JetBrains Mono)

#### API & Backend

- ✅ API REST `/api/waitlist` (POST/GET)
- ✅ Validation avec Zod
- ✅ Détection des doublons
- ✅ Position automatique dans la file

#### Infrastructure

- ✅ Proxy Next.js 16 avec Clerk (`proxy.ts`)
- ✅ Docker Compose (PostgreSQL 16, Redis 7)
- ✅ Configuration multi-environnement (.env.example, .env.local.example)

#### Emails

- ✅ Intégration Resend
- ✅ Email de bienvenue avec position
- ✅ Email d'invitation (template prêt)
- ✅ Templates HTML responsive avec gradient

#### Design System

- ✅ **Palette de couleurs** configurée dans Tailwind CSS 4
  - Primary: Navy Blue (#1B4F82, #14406A)
  - Secondary: Cyan (#00B4C8, #00D4E8)
  - Grey: Neutral (#4A5568, #EDF2F7)
- ✅ **Typographie** complète
  - Display/Titres: Syne Bold (700-800)
  - Corps de texte: Inter
  - Interface/Code: JetBrains Mono
  - Échelle typographique (xs à 6xl)
  - Line heights et letter spacing
- ✅ Support dark mode automatique
- ✅ Composants stylisés avec la nouvelle palette
- ✅ Documentation complète du design system

#### Documentation

- ✅ `README_PHASE_0.md` - Guide de démarrage
- ✅ `docs/PHASE_0_WAITLIST.md` - Documentation technique
- ✅ `docs/SETUP_CLERK.md` - Configuration Clerk
- ✅ `docs/SETUP_RESEND.md` - Configuration Resend
- ✅ `docs/DESIGN_SYSTEM.md` - Guide du design system (couleurs + typo)
- ✅ `docs/DOCKER_SETUP.md` - Configuration Docker
- ✅ `public/fonts/README.md` - Guide des polices
- ✅ Steering rules (product.md, tech.md, structure.md)

### Configuration requise

```bash
# Dépendances
pnpm add zod resend @clerk/nextjs @prisma/adapter-pg pg @types/pg

# Variables d'environnement minimales
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."
RESEND_API_KEY="re_..."
DATABASE_URL="postgresql://gatectr:secret@localhost:5432/gatectr_dev"
ENABLE_WAITLIST="true"
ENABLE_SIGNUPS="false"
```

### Workflow Phase 0

1. **Pré-lancement** : `ENABLE_WAITLIST=true` + `ENABLE_SIGNUPS=false`
   - `/` → redirige vers `/waitlist`
   - `/sign-up` → redirige vers `/waitlist`
   - Collecte des inscriptions

2. **Lancement** : `ENABLE_WAITLIST=false` + `ENABLE_SIGNUPS=true`
   - `/` → landing page
   - `/sign-up` → inscription Clerk
   - Accès complet à l'application

### Prochaines étapes

#### À implémenter

- [ ] Système d'invitation par batch
- [ ] Protection RBAC de l'admin
- [ ] Analytics waitlist
- [ ] Système de parrainage

#### Phase 1 - Onboarding

- [ ] Configuration Clerk complète
- [ ] Création du premier projet
- [ ] Ajout des clés API LLM
- [ ] Génération de la clé GateCtr

### Fichiers créés

```
app/
├── page.tsx (mise à jour avec palette)
├── (marketing)/waitlist/page.tsx (nouvelle palette)
├── (admin)/admin/waitlist/page.tsx (nouvelle palette)
├── api/waitlist/route.ts
└── globals.css (design system complet)

lib/
├── prisma.ts
└── resend.ts

prisma/
├── schema.prisma
├── prisma.config.ts
├── seed.ts
└── migrations/20260315114234_init_complete_schema/

docs/
├── PHASE_0_WAITLIST.md
├── SETUP_CLERK.md
├── SETUP_RESEND.md
├── DESIGN_SYSTEM.md
└── DOCKER_SETUP.md

.kiro/steering/
├── product.md
├── tech.md
└── structure.md

proxy.ts
.env.local.example
README_PHASE_0.md
CHANGELOG.md
```

### Notes techniques

- Next.js 16 utilise `proxy.ts` au lieu de `middleware.ts`
- Prisma 7 nécessite `prisma.config.ts` pour la configuration
- Tailwind CSS 4 utilise la syntaxe `@theme inline` dans globals.css
- Le design system respecte WCAG 2.1 niveau AA pour l'accessibilité

### Statut

✅ **Phase 0 - Waitlist : COMPLÈTE ET FONCTIONNELLE**

Prêt pour le déploiement et la collecte d'inscriptions.
