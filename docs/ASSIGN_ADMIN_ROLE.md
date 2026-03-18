# Assigner le Rôle Admin

Guide rapide pour donner les droits admin à un utilisateur.

## Prérequis

- ✅ Base de données migrée (`pnpm prisma migrate dev`)
- ✅ Seed exécuté (`pnpm prisma db seed`)
- ✅ Application démarrée (`pnpm dev`)
- ✅ Compte créé via Clerk (première connexion)

## Étapes

### 1. Ouvrir Prisma Studio

```bash
pnpm prisma studio
```

Cela ouvrira l'interface web sur http://localhost:5555

### 2. Trouver votre User ID

1. Cliquer sur la table `User`
2. Trouver votre utilisateur (par email)
3. Copier l'`id` (ex: `cmmrp44if0000vonnru50savs`)

### 3. Trouver le Role ID de ADMIN

1. Cliquer sur la table `Role`
2. Trouver le rôle avec `name = "ADMIN"`
3. Copier l'`id` du rôle ADMIN

### 4. Créer l'Association User-Role

1. Cliquer sur la table `UserRole`
2. Cliquer sur "Add record"
3. Remplir les champs :
   - `userId`: votre user id (étape 2)
   - `roleId`: l'id du rôle ADMIN (étape 3)
   - `grantedBy`: laisser vide (optionnel)
4. Cliquer sur "Save 1 change"

### 5. Vérifier

1. Rafraîchir la page `/admin/waitlist`
2. Vous devriez maintenant voir la liste des inscrits
3. Si vous voyez "Access Denied", vérifier que l'association a bien été créée

## Alternative: SQL Direct

Si vous préférez utiliser SQL directement :

```sql
-- 1. Trouver votre user ID
SELECT id, email FROM users WHERE email = 'votre@email.com';

-- 2. Trouver le role ID de ADMIN
SELECT id, name FROM roles WHERE name = 'ADMIN';

-- 3. Créer l'association
INSERT INTO user_roles (id, user_id, role_id, created_at)
VALUES (
  'ur_' || gen_random_uuid()::text,
  'VOTRE_USER_ID',
  'ROLE_ADMIN_ID',
  NOW()
);
```

## Rôles Disponibles

- `SUPER_ADMIN` - Accès complet au système
- `ADMIN` - Accès admin panel et gestion utilisateurs
- `MANAGER` - Gestion équipes et projets
- `DEVELOPER` - Accès API et outils dev
- `VIEWER` - Lecture seule
- `SUPPORT` - Accès support client

## Troubleshooting

### "Access Denied" persiste

1. Vérifier que l'association existe dans `user_roles`
2. Vérifier que le `roleId` correspond bien au rôle ADMIN
3. Vérifier que le `userId` correspond à votre utilisateur
4. Déconnecter/reconnecter de Clerk
5. Vider le cache du navigateur

### Prisma Studio ne s'ouvre pas

```bash
# Vérifier que la DB est accessible
pnpm prisma db pull

# Régénérer le client Prisma
pnpm prisma generate
```

### Erreur "User not found"

L'utilisateur n'a pas encore été créé dans la DB. Assurez-vous de :

1. Vous être connecté au moins une fois via Clerk
2. Que le webhook Clerk est configuré (optionnel)
3. Ou créer l'utilisateur manuellement dans Prisma Studio
