# Guide de Test des Webhooks Clerk - Quick Start

## Prérequis

- ✅ Serveur Next.js qui tourne (`pnpm dev`)
- ✅ Base de données PostgreSQL accessible
- ✅ Roles et permissions seedés (`pnpm prisma db seed`)
- ✅ Variables d'environnement configurées dans `.env.local`

## Méthode 1 : Clerk CLI (Le plus simple)

### Installation rapide

```bash
# Installez Clerk CLI globalement
pnpm add -g @clerk/clerk-cli

# Authentifiez-vous
clerk login
```

### Test en 3 étapes

**Terminal 1** - Démarrez votre app :

```bash
pnpm dev
```

**Terminal 2** - Démarrez le tunnel Clerk :

```bash
clerk listen --forward-to http://localhost:3000/api/webhooks/clerk
```

**Navigateur** - Créez un utilisateur :

1. Allez sur `http://localhost:3000/sign-up`
2. Créez un compte avec votre email
3. Observez les logs dans Terminal 2

### Ce que vous devriez voir

**Dans Terminal 2 (Clerk CLI)** :

```
✓ Listening for webhooks...
→ user.created event received
→ Forwarding to http://localhost:3000/api/webhooks/clerk
✓ 200 OK
```

**Dans Terminal 1 (Next.js)** :

```
User created: votre-email@example.com (cuid_abc123)
```

**Dans Prisma Studio** (`pnpm prisma studio`) :

- Table `users` : Nouvel utilisateur créé
- Table `user_roles` : Rôle DEVELOPER assigné
- Table `audit_logs` : Entrée avec action "user.created"
- Table `email_logs` : Email de bienvenue envoyé

## Méthode 2 : ngrok (Alternative)

### Installation

```bash
# Windows avec Chocolatey
choco install ngrok

# Ou téléchargez depuis https://ngrok.com/download
```

### Configuration

```bash
# Créez un compte sur ngrok.com et récupérez votre token
ngrok config add-authtoken VOTRE_TOKEN

# Démarrez le tunnel
ngrok http 3000
```

### Configuration dans Clerk Dashboard

1. Copiez l'URL HTTPS de ngrok (ex: `https://abc123.ngrok.io`)
2. Allez dans Clerk Dashboard > Webhooks
3. Ajoutez l'endpoint : `https://abc123.ngrok.io/api/webhooks/clerk`
4. Sélectionnez les événements : `user.created`, `user.updated`, `user.deleted`
5. Copiez le Signing Secret et ajoutez-le à `.env.local`

## Vérification rapide

### Checklist après création d'utilisateur

```bash
# 1. Vérifiez la base de données
pnpm prisma studio

# 2. Vérifiez les logs du serveur
# Recherchez : "User created: email@example.com"

# 3. Vérifiez l'email (si Resend configuré)
# Consultez https://resend.com/emails
```

### Requête SQL de vérification

```sql
-- Vérifiez que l'utilisateur existe avec le bon rôle
SELECT
  u.email,
  u.name,
  r.name as role
FROM users u
JOIN user_roles ur ON u.id = ur.user_id
JOIN roles r ON ur.role_id = r.id
WHERE u.email = 'votre-email@example.com';
```

## Commandes Clerk CLI utiles

```bash
# Lister vos apps
clerk apps

# Changer d'app
clerk switch

# Voir les webhooks configurés
clerk webhooks list

# Déclencher manuellement un événement
clerk webhooks trigger user.created

# Voir les logs en temps réel
clerk listen --forward-to http://localhost:3000/api/webhooks/clerk --verbose
```

## Dépannage rapide

### ❌ Erreur "Invalid signature"

**Solution** :

```bash
# 1. Vérifiez votre .env.local
cat .env.local | grep CLERK_WEBHOOK_SECRET

# 2. Redémarrez le serveur
# Ctrl+C puis pnpm dev
```

### ❌ Erreur "DEVELOPER role not found"

**Solution** :

```bash
# Seedez la base de données
pnpm prisma db seed
```

### ❌ L'utilisateur n'apparaît pas dans la DB

**Solution** :

```bash
# 1. Vérifiez que la DB est accessible
pnpm prisma studio

# 2. Vérifiez les migrations
pnpm prisma migrate dev

# 3. Consultez les logs du serveur pour voir l'erreur exacte
```

### ❌ L'email n'est pas envoyé

**C'est normal !** L'email est envoyé de manière asynchrone et n'empêche pas la création de l'utilisateur.

**Vérification** :

1. Consultez les logs du serveur pour voir si l'email a échoué
2. Vérifiez la table `email_logs` dans Prisma Studio
3. Vérifiez que `RESEND_API_KEY` est configuré dans `.env.local`

## Test des autres événements

### Test de user.updated

1. Allez sur `http://localhost:3000/dashboard` (ou votre page de profil)
2. Modifiez votre nom ou email
3. Observez l'événement `user.updated` dans les logs

### Test de user.deleted

1. Allez dans Clerk Dashboard > Users
2. Supprimez un utilisateur de test
3. Vérifiez que `isActive` est passé à `false` dans la DB (soft delete)

## Logs à surveiller

### ✅ Succès complet

```
→ user.created event received
User created: test@example.com (cuid_abc123)
Email sent successfully to test@example.com
```

### ⚠️ Succès partiel (email échoué)

```
→ user.created event received
User created: test@example.com (cuid_abc123)
Failed to send welcome email: [error details]
```

**C'est OK !** L'utilisateur est créé même si l'email échoue.

### ❌ Échec complet

```
→ user.created event received
Error processing user.created: [error details]
```

**Action** : Consultez l'erreur et corrigez le problème.

## Prochaines étapes

Une fois les webhooks testés et fonctionnels :

1. ✅ Configurez le webhook en production avec votre vraie URL
2. ✅ Testez les 3 événements (created, updated, deleted)
3. ✅ Vérifiez que les emails sont bien envoyés
4. ✅ Passez à la tâche suivante du spec (Task 8)

## Ressources

- [Documentation Clerk CLI](https://clerk.com/docs/references/cli)
- [Documentation Webhooks Clerk](https://clerk.com/docs/integrations/webhooks)
- [Documentation ngrok](https://ngrok.com/docs)
