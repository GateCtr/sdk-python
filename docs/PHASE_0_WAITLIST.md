# Phase 0 — Waitlist

Landing pré-lancement avec gestion des inscrits. Avant d'ouvrir les inscriptions, déployez la page waitlist.

## Configuration

### Variables d'environnement

```bash
# Feature Flags
ENABLE_WAITLIST=true      # Active la redirection vers /waitlist
ENABLE_SIGNUPS=false      # Bloque les inscriptions directes via Clerk

# Email
RESEND_API_KEY=re_xxx
EMAIL_FROM="GateCtr <noreply@gatectr.io>"

# App URL
NEXT_PUBLIC_APP_URL=https://gatectr.io
```

## Fichiers créés

### Pages

- **`app/(marketing)/waitlist/page.tsx`** - Page publique d'inscription à la waitlist
  - Formulaire avec email (requis), nom, entreprise, use case
  - Affichage de la position dans la file d'attente
  - Design responsive avec dark mode

- **`app/(admin)/waitlist/page.tsx`** - Interface admin de gestion
  - Liste paginée des inscrits
  - Filtres par statut (WAITING, INVITED, JOINED)
  - Bouton "Invite Batch" pour inviter par lots
  - Statistiques en temps réel

### API

- **`app/api/waitlist/route.ts`**
  - `POST` - Inscription à la waitlist
    - Validation avec Zod
    - Vérification des doublons
    - Calcul automatique de la position
    - Envoi d'email de bienvenue
  - `GET` - Liste des inscrits (admin only)
    - Pagination
    - Filtrage par statut

### Proxy (Middleware)

- **`proxy.ts`** - Next.js 16 proxy layer
  - Redirection `/sign-up` → `/waitlist` si `ENABLE_WAITLIST=true`
  - Protection des routes privées avec Clerk
  - Gestion de l'authentification

### Utilitaires

- **`lib/resend.ts`** - Helpers pour l'envoi d'emails
  - `sendWelcomeWaitlistEmail()` - Email de confirmation avec position
  - `sendInviteEmail()` - Email d'invitation avec code

## Fonctionnalités

### 1. Inscription à la waitlist

Les utilisateurs peuvent s'inscrire avec :

- Email (obligatoire)
- Nom
- Entreprise
- Use case (saas, agent, enterprise, dev)

Chaque inscription :

- Reçoit un numéro de position automatique
- Déclenche un email de bienvenue
- Enregistre l'IP et User-Agent pour tracking

### 2. Gestion admin

Interface admin pour :

- Visualiser tous les inscrits
- Filtrer par statut
- Inviter individuellement ou par batch
- Suivre les conversions (WAITING → INVITED → JOINED)

### 3. Protection des inscriptions

Quand `ENABLE_WAITLIST=true` et `ENABLE_SIGNUPS=false` :

- Les tentatives d'accès à `/sign-up` redirigent vers `/waitlist`
- Les inscriptions directes via Clerk sont bloquées
- Seuls les utilisateurs invités peuvent créer un compte

## Workflow

### Phase pré-lancement

1. Activer la waitlist :

   ```bash
   ENABLE_WAITLIST=true
   ENABLE_SIGNUPS=false
   ```

2. Les utilisateurs s'inscrivent sur `/waitlist`

3. Ils reçoivent un email avec leur position

4. L'admin gère les invitations depuis `/admin/waitlist`

### Invitation par batch

1. Admin sélectionne un groupe d'utilisateurs (ex: top 100)

2. Système génère des codes d'invitation uniques

3. Emails d'invitation envoyés avec lien `/sign-up?invite=CODE`

4. Statut passe de `WAITING` à `INVITED`

5. Après inscription, statut passe à `JOINED`

## Modèle de données

```prisma
model WaitlistEntry {
  id           String          @id @default(cuid())
  email        String          @unique
  name         String?
  company      String?
  useCase      String?         // "saas"|"agent"|"enterprise"|"dev"
  referralCode String?
  referredBy   String?
  position     Int             @default(autoincrement())
  status       WaitlistStatus  @default(WAITING)
  invitedAt    DateTime?
  joinedAt     DateTime?
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime        @default(now())
}

enum WaitlistStatus {
  WAITING
  INVITED
  JOINED
}
```

## Emails

### Email de bienvenue

Envoyé automatiquement après inscription :

- Confirmation de l'inscription
- Position dans la file
- Présentation des fonctionnalités
- Design responsive avec gradient

### Email d'invitation

Envoyé par l'admin :

- Lien d'inscription avec code
- Instructions de démarrage
- Expiration dans 7 jours

## Prochaines étapes

Une fois la waitlist remplie :

1. Inviter les premiers utilisateurs par batch

2. Collecter les retours

3. Quand prêt pour le lancement public :

   ```bash
   ENABLE_WAITLIST=false
   ENABLE_SIGNUPS=true
   ```

4. Passer à la Phase 1 - Onboarding

## Dépendances requises

```bash
pnpm add zod resend @clerk/nextjs
```

## Notes de sécurité

- Les emails sont validés avec Zod
- Les doublons sont détectés automatiquement
- L'IP et User-Agent sont enregistrés pour détecter les abus
- Les routes admin doivent être protégées par RBAC (à implémenter)
