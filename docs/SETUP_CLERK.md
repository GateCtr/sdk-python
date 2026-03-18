# Configuration Clerk - Guide Rapide

## Étape 1 : Créer un compte Clerk

1. Allez sur [https://clerk.com](https://clerk.com)
2. Cliquez sur "Start building for free"
3. Créez votre compte (Email, Google, ou GitHub)

## Étape 2 : Créer une application

1. Dans le dashboard Clerk, cliquez sur "Create application"
2. Donnez un nom : **GateCtr**
3. Choisissez les méthodes d'authentification :
   - ✅ Email
   - ✅ Google (recommandé)
   - ✅ GitHub (recommandé)
4. Cliquez sur "Create application"

## Étape 3 : Récupérer les clés API

1. Dans le dashboard, allez dans **"API Keys"** (menu de gauche)
2. Vous verrez deux clés :
   - **Publishable key** : `pk_test_XXXXXXX...`
   - **Secret key** : `sk_test_XXXXXXX...`
3. Copiez ces deux clés

## Étape 4 : Configurer votre .env.local

Créez un fichier `.env.local` à la racine du projet :

```bash
# Collez vos clés Clerk ici
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_VOTRE_CLE_ICI"
CLERK_SECRET_KEY="sk_test_VOTRE_CLE_ICI"

# URLs de redirection (ne pas modifier)
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL="/dashboard"
```

## Étape 5 : Tester

1. Redémarrez votre serveur de développement :

   ```bash
   pnpm dev
   ```

2. L'erreur "Publishable key not valid" devrait disparaître

## Configuration avancée (optionnel)

### Personnaliser l'apparence

Dans Clerk Dashboard > **Customization** :

- Logo
- Couleurs
- Thème (light/dark)

### Configurer les webhooks

Pour synchroniser les utilisateurs Clerk avec votre DB :

1. Dans Clerk Dashboard > **Webhooks**
2. Cliquez sur **"Add Endpoint"**
3. Configurez l'endpoint :
   - **Endpoint URL** : `https://votre-domaine.com/api/webhooks/clerk`
   - Pour le développement local, voir la section "Test en local" ci-dessous
4. Sélectionnez les événements :
   - ✅ `user.created`
   - ✅ `user.updated`
   - ✅ `user.deleted`
5. Cliquez sur **"Create"**
6. Copiez le **Signing Secret** : `whsec_...`
7. Ajoutez à `.env.local` :
   ```bash
   CLERK_WEBHOOK_SECRET="whsec_VOTRE_SECRET"
   ```

## Test des webhooks en local

### Option 1 : Clerk CLI (Recommandé)

Le Clerk CLI permet de tester les webhooks localement sans exposer votre serveur sur Internet.

#### Installation

```bash
# Avec npm
npm install -g @clerk/clerk-cli

# Avec pnpm
pnpm add -g @clerk/clerk-cli

# Avec yarn
yarn global add @clerk/clerk-cli
```

#### Configuration

1. **Authentifiez-vous avec Clerk** :

   ```bash
   clerk login
   ```

   Cela ouvrira votre navigateur pour vous connecter.

2. **Vérifiez votre installation** :
   ```bash
   clerk --version
   ```

#### Utilisation pour tester les webhooks

1. **Démarrez votre serveur Next.js** (dans un terminal) :

   ```bash
   pnpm dev
   ```

   Votre app tourne sur `http://localhost:3000`

2. **Démarrez le tunnel Clerk** (dans un autre terminal) :

   ```bash
   clerk listen --forward-to http://localhost:3000/api/webhooks/clerk
   ```

3. **Ce que fait cette commande** :
   - Crée un tunnel sécurisé entre Clerk et votre localhost
   - Affiche une URL publique temporaire (ex: `https://abc123.clerk.accounts.dev`)
   - Redirige automatiquement les webhooks vers votre endpoint local
   - Affiche les événements en temps réel dans le terminal

4. **Testez en créant un utilisateur** :
   - Allez sur `http://localhost:3000/sign-up`
   - Créez un nouveau compte
   - Observez les logs dans le terminal où `clerk listen` tourne
   - Vérifiez que l'utilisateur est créé dans votre base de données

#### Commandes utiles

```bash
# Lister vos applications Clerk
clerk apps

# Changer d'application
clerk switch

# Voir les webhooks configurés
clerk webhooks list

# Tester un webhook spécifique
clerk webhooks trigger user.created

# Voir l'aide
clerk --help
```

### Option 2 : ngrok (Alternative)

Si vous préférez ngrok :

1. **Installez ngrok** :

   ```bash
   # Avec Chocolatey (Windows)
   choco install ngrok

   # Ou téléchargez depuis https://ngrok.com/download
   ```

2. **Créez un compte sur ngrok.com** et récupérez votre authtoken

3. **Configurez ngrok** :

   ```bash
   ngrok config add-authtoken VOTRE_TOKEN
   ```

4. **Démarrez le tunnel** :

   ```bash
   ngrok http 3000
   ```

5. **Copiez l'URL HTTPS** affichée (ex: `https://abc123.ngrok.io`)

6. **Configurez le webhook dans Clerk Dashboard** :
   - Endpoint URL : `https://abc123.ngrok.io/api/webhooks/clerk`
   - Événements : `user.created`, `user.updated`, `user.deleted`

7. **Testez** en créant un utilisateur sur votre app

### Option 3 : Test manuel avec curl

Pour tester rapidement sans créer de vrais utilisateurs :

```bash
# Récupérez votre webhook secret
WEBHOOK_SECRET="whsec_VOTRE_SECRET"

# Testez l'endpoint (remplacez les valeurs)
curl -X POST http://localhost:3000/api/webhooks/clerk \
  -H "Content-Type: application/json" \
  -H "svix-id: msg_test123" \
  -H "svix-timestamp: $(date +%s)" \
  -H "svix-signature: v1,SIGNATURE_ICI" \
  -d '{
    "type": "user.created",
    "data": {
      "id": "user_test123",
      "email_addresses": [{"email_address": "test@example.com"}],
      "first_name": "Test",
      "last_name": "User",
      "image_url": "https://example.com/avatar.jpg"
    }
  }'
```

**Note** : Cette méthode nécessite de générer une signature Svix valide, ce qui est complexe. Utilisez plutôt Clerk CLI ou ngrok.

## Vérification du webhook

Après avoir testé, vérifiez que tout fonctionne :

1. **Base de données** :

   ```bash
   # Ouvrez Prisma Studio
   pnpm prisma studio
   ```

   - Vérifiez qu'un nouvel utilisateur existe dans la table `users`
   - Vérifiez qu'il a le rôle `DEVELOPER` dans `user_roles`
   - Vérifiez l'entrée dans `audit_logs` avec action `user.created`

2. **Email** :
   - Vérifiez que l'email de bienvenue a été envoyé
   - Consultez le dashboard Resend pour voir le statut
   - Vérifiez l'entrée dans `email_logs`

3. **Logs du serveur** :
   ```
   User created: test@example.com (cuid_abc123)
   ```

## Dépannage

### Erreur "Invalid signature"

- Vérifiez que `CLERK_WEBHOOK_SECRET` est correct dans `.env.local`
- Redémarrez votre serveur après avoir modifié `.env.local`
- Vérifiez que vous utilisez le bon secret (test vs production)

### Erreur "DEVELOPER role not found"

- Exécutez le seed de la base de données :
  ```bash
  pnpm prisma db seed
  ```

### L'utilisateur n'est pas créé

- Vérifiez les logs du serveur pour voir les erreurs
- Vérifiez que la base de données est accessible
- Vérifiez que les migrations sont à jour :
  ```bash
  pnpm prisma migrate dev
  ```

### L'email n'est pas envoyé

- Vérifiez que `RESEND_API_KEY` est configuré
- L'email est envoyé de manière asynchrone, donc le webhook retourne 200 même si l'email échoue
- Consultez les logs du serveur pour voir les erreurs d'email
- Vérifiez la table `email_logs` pour le statut
