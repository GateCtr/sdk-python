# 🚀 Quick Start - Test du Webhook Clerk (5 minutes)

## Prérequis

Avant de commencer, assurez-vous d'avoir :

- ✅ Node.js 20+ installé
- ✅ PostgreSQL qui tourne (Docker ou local)
- ✅ Un compte Clerk (gratuit sur clerk.com)

## Étape 1 : Vérifiez votre configuration (30 secondes)

```bash
pnpm test:webhook
```

**Si tout est vert** ✅ : Passez à l'étape 2
**Si des erreurs** ❌ : Suivez les instructions affichées

## Étape 2 : Installez Clerk CLI (1 minute)

```bash
# Installation globale
pnpm add -g @clerk/clerk-cli

# Authentification
clerk login
```

Cela ouvrira votre navigateur pour vous connecter à Clerk.

## Étape 3 : Démarrez votre serveur (30 secondes)

**Terminal 1** :

```bash
pnpm dev
```

Attendez que le serveur démarre sur http://localhost:3000

## Étape 4 : Démarrez le tunnel Clerk (30 secondes)

**Terminal 2** :

```bash
clerk listen --forward-to http://localhost:3000/api/webhooks/clerk
```

Vous devriez voir :

```
✓ Listening for webhooks...
✓ Forwarding to http://localhost:3000/api/webhooks/clerk
```

## Étape 5 : Créez un utilisateur de test (2 minutes)

1. Ouvrez votre navigateur sur http://localhost:3000/sign-up
2. Créez un compte avec votre email
3. Vérifiez votre email et confirmez

## Étape 6 : Observez la magie ✨

**Dans Terminal 2 (Clerk CLI)**, vous verrez :

```
→ user.created event received
→ Forwarding to http://localhost:3000/api/webhooks/clerk
✓ 200 OK
```

**Dans Terminal 1 (Next.js)**, vous verrez :

```
User created: votre-email@example.com (cuid_abc123)
```

## Étape 7 : Vérifiez dans la base de données (1 minute)

```bash
pnpm prisma studio
```

Vérifiez ces tables :

- **users** : Votre nouvel utilisateur
- **user_roles** : Rôle DEVELOPER assigné
- **audit_logs** : Entrée "user.created"
- **email_logs** : Email de bienvenue envoyé

## ✅ C'est tout !

Votre webhook fonctionne ! Vous pouvez maintenant :

1. Tester `user.updated` en modifiant votre profil
2. Tester `user.deleted` en supprimant l'utilisateur dans Clerk Dashboard
3. Passer à la tâche suivante du spec

## 🆘 Problèmes ?

### Le tunnel Clerk ne démarre pas

```bash
# Vérifiez que vous êtes connecté
clerk whoami

# Reconnectez-vous si nécessaire
clerk login
```

### L'utilisateur n'est pas créé dans la DB

```bash
# Vérifiez que les rôles existent
pnpm prisma db seed

# Vérifiez les migrations
pnpm prisma migrate dev
```

### L'email n'est pas envoyé

C'est normal ! L'email est envoyé de manière asynchrone et n'empêche pas la création de l'utilisateur. Vérifiez :

- Les logs du serveur pour voir l'erreur
- La table `email_logs` pour le statut
- Que `RESEND_API_KEY` est configuré

## 📚 Documentation complète

- **Configuration détaillée** : `docs/SETUP_CLERK.md`
- **Guide de test complet** : `docs/WEBHOOK_TESTING.md`
- **Résumé de l'implémentation** : `WEBHOOK_SETUP_COMPLETE.md`

## 🎯 Prochaines étapes

Une fois les webhooks testés :

1. ✅ Task 7 terminée
2. ⏭️ Task 8 : Checkpoint
3. ⏭️ Task 9 : API de vérification des permissions
