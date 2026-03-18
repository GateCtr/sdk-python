# Branching Strategy (GitHub Flow)

## Branches principales

| Branche   | Rôle                                      |
| --------- | ----------------------------------------- |
| `main`    | Production stable — jamais de push direct |
| `develop` | Intégration continue des features         |

## Créer une feature branch

```bash
git checkout develop
git pull origin develop
git checkout -b feat/budget-firewall
```

## Créer un hotfix (depuis main)

```bash
git checkout main
git checkout -b hotfix/fix-token-overflow
```

## Workflow complet

```bash
git checkout -b feat/context-optimizer

# ... développement ...

git add .
git commit -m "feat(optimizer): implement context compression"
git push origin feat/context-optimizer
```

Puis :

1. Ouvrir une Pull Request vers `develop`
2. Code review
3. Merge avec squash
4. Delete branch

## Conventions de nommage

| Préfixe     | Usage                          | Exemple                     |
| ----------- | ------------------------------ | --------------------------- |
| `feat/`     | Nouvelle fonctionnalité        | `feat/context-optimizer`    |
| `fix/`      | Correction de bug              | `fix/token-overflow`        |
| `hotfix/`   | Correctif urgent depuis `main` | `hotfix/fix-token-overflow` |
| `chore/`    | Maintenance, config            | `chore/update-dependencies` |
| `docs/`     | Documentation                  | `docs/docker-setup`         |
| `refactor/` | Refactoring                    | `refactor/router-scoring`   |

## Règles

- Toujours partir de `develop` sauf pour les hotfixes
- Jamais de push direct sur `main` ou `develop`
- Une branche = une feature / un fix
- Supprimer la branche après merge
