# CI/CD Documentation

## Overview

GateCtr utilise GitHub Actions pour l'intégration continue (CI) et le déploiement continu (CD). Cette documentation décrit les workflows automatisés et comment les utiliser.

## Workflows

### 1. CI Pipeline (`ci.yml`)

Déclenché sur: Push et Pull Requests vers `main` et `develop`

**Jobs:**

- **Lint & Format**: Vérifie le code avec ESLint et Prettier
- **Type Check**: Valide les types TypeScript
- **Unit Tests**: Exécute les tests unitaires avec Vitest et génère le rapport de couverture
- **Build**: Compile l'application Next.js
- **E2E Tests**: Exécute les tests end-to-end avec Playwright
- **Prisma Validate**: Valide le schéma Prisma et vérifie les migrations

**Services:**

- PostgreSQL 18 (pour les tests)
- Redis 7 (pour les tests)

### 2. Deploy Pipeline (`deploy.yml`)

Déclenché sur: Push vers `main` ou manuellement via workflow_dispatch

**Environnements:**

#### Staging

- URL: https://staging.gatectr.com
- Branche: `develop`
- Déploiement automatique

#### Production

- URL: https://gatectr.com
- Branche: `main`
- Déploiement automatique avec protection

**Étapes:**

1. Installation des dépendances
2. Génération du client Prisma
3. Exécution des migrations de base de données
4. Build de l'application
5. Déploiement sur Vercel
6. Création d'une release Sentry (production uniquement)

### 3. Docker Build & Push (`docker.yml`)

Déclenché sur: Push vers `main`/`develop` et tags `v*`

**Actions:**

- Build des images Docker multi-architecture (amd64, arm64)
- Push vers GitHub Container Registry
- Scan de sécurité avec Trivy
- Cache optimisé avec GitHub Actions Cache

**Images:**

- `ghcr.io/[org]/gatectr:main` - Image de production
- `ghcr.io/[org]/gatectr:develop` - Image de développement
- `ghcr.io/[org]/gatectr:v*` - Images versionnées

### 4. CodeQL Security Analysis (`codeql.yml`)

Déclenché sur:

- Push vers `main`/`develop`
- Pull Requests
- Tous les lundis à 6h UTC (scan programmé)

**Analyse:**

- Détection de vulnérabilités de sécurité
- Analyse de qualité du code
- Rapports dans GitHub Security

### 5. PR Checks (`pr-checks.yml`)

Déclenché sur: Ouverture/mise à jour de Pull Requests

**Validations:**

- Titre de PR suit Conventional Commits
- Taille de PR (avec labels automatiques)
- Description de PR complète
- Vérification des conflits de merge
- Labels requis présents

### 6. Release (`release.yml`)

Déclenché sur: Push de tags `v*.*.*`

**Actions:**

- Génération automatique du changelog
- Création de GitHub Release
- Build et push de l'image Docker versionnée
- Notifications

## Configuration des Secrets

### Secrets GitHub requis

```bash
# Vercel
VERCEL_TOKEN                          # Token d'API Vercel
VERCEL_ORG_ID                         # ID de l'organisation Vercel
VERCEL_PROJECT_ID                     # ID du projet Vercel

# Base de données
STAGING_DATABASE_URL                  # URL PostgreSQL staging
PRODUCTION_DATABASE_URL               # URL PostgreSQL production

# Clerk (Authentication)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY     # Clé publique Clerk
CLERK_SECRET_KEY                      # Clé secrète Clerk

# Sentry (Monitoring)
SENTRY_AUTH_TOKEN                     # Token d'authentification Sentry
SENTRY_ORG                            # Organisation Sentry
SENTRY_PROJECT                        # Projet Sentry

# Autres services
STRIPE_SECRET_KEY                     # Clé secrète Stripe
UPSTASH_REDIS_URL                     # URL Redis Upstash
RESEND_API_KEY                        # Clé API Resend
```

### Configuration dans GitHub

1. Aller dans Settings > Secrets and variables > Actions
2. Ajouter chaque secret avec sa valeur
3. Configurer les environnements (staging, production) avec protection

## Dependabot

Configuration automatique des mises à jour de dépendances:

- **npm packages**: Vérification hebdomadaire (lundi 6h)
- **GitHub Actions**: Vérification hebdomadaire
- **Docker images**: Vérification hebdomadaire

Les PRs sont créées automatiquement avec:

- Labels: `dependencies`, `automated`
- Prefix de commit: `chore(deps)`
- Limite: 10 PRs ouvertes maximum

## Conventional Commits

Format requis pour les commits et PR:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types autorisés:**

- `feat`: Nouvelle fonctionnalité
- `fix`: Correction de bug
- `docs`: Documentation
- `style`: Formatage, style
- `refactor`: Refactoring
- `perf`: Amélioration de performance
- `test`: Tests
- `build`: Build system
- `ci`: CI/CD
- `chore`: Tâches diverses
- `revert`: Annulation de commit

**Exemples:**

```bash
feat(auth): add OAuth2 support
fix(api): resolve token expiration issue
docs(readme): update installation instructions
ci(deploy): add staging environment
```

## Workflow de Développement

### 1. Créer une branche

```bash
git checkout -b feat/my-feature
# ou
git checkout -b fix/bug-description
```

### 2. Développer et commiter

```bash
git add .
git commit -m "feat(scope): description"
```

Les hooks Husky vont automatiquement:

- Linter le code
- Vérifier les types
- Formater avec Prettier

### 3. Pousser et créer une PR

```bash
git push origin feat/my-feature
```

Créer une PR sur GitHub avec:

- Titre suivant Conventional Commits
- Description complète (utiliser le template)
- Labels appropriés

### 4. CI automatique

Les workflows CI vont:

- ✅ Linter et formater
- ✅ Vérifier les types
- ✅ Exécuter les tests
- ✅ Builder l'application
- ✅ Valider le schéma Prisma

### 5. Review et merge

Après approbation:

- Merge vers `develop` → Déploiement staging automatique
- Merge vers `main` → Déploiement production automatique

## Déploiement Manuel

### Via GitHub Actions

1. Aller dans Actions > Deploy
2. Cliquer sur "Run workflow"
3. Sélectionner l'environnement (staging/production)
4. Cliquer sur "Run workflow"

### Via CLI

```bash
# Staging
vercel --prod --scope=your-org

# Production
vercel --prod --scope=your-org
```

## Rollback

### Via Vercel Dashboard

1. Aller sur vercel.com
2. Sélectionner le projet
3. Aller dans Deployments
4. Cliquer sur "..." d'un déploiement précédent
5. Cliquer sur "Promote to Production"

### Via GitHub

1. Créer un tag de rollback:

```bash
git tag -a v1.2.3-rollback -m "Rollback to v1.2.3"
git push origin v1.2.3-rollback
```

2. Le workflow de release va se déclencher automatiquement

## Monitoring

### GitHub Actions

- Voir l'état des workflows: Actions tab
- Logs détaillés pour chaque job
- Artifacts téléchargeables (build, test reports)

### Vercel

- Dashboard: https://vercel.com/dashboard
- Logs en temps réel
- Métriques de performance

### Sentry

- Erreurs et exceptions
- Performance monitoring
- Release tracking

## Troubleshooting

### Les tests échouent en CI mais passent localement

1. Vérifier les variables d'environnement
2. Vérifier les versions Node.js/pnpm
3. Nettoyer le cache: `pnpm store prune`

### Le déploiement échoue

1. Vérifier les secrets GitHub
2. Vérifier les logs Vercel
3. Vérifier les migrations Prisma

### Docker build échoue

1. Vérifier le Dockerfile
2. Vérifier les dépendances système
3. Tester localement: `docker build -f docker/Dockerfile .`

## Best Practices

1. **Toujours créer une PR** - Jamais de push direct sur main/develop
2. **Tests locaux** - Exécuter les tests avant de pousser
3. **Commits atomiques** - Un commit = une fonctionnalité/fix
4. **Description claire** - Expliquer le "pourquoi" pas le "quoi"
5. **Review de code** - Au moins une approbation requise
6. **Migrations testées** - Toujours tester les migrations localement
7. **Rollback plan** - Avoir un plan de rollback pour chaque déploiement

## Ressources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vercel Documentation](https://vercel.com/docs)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
