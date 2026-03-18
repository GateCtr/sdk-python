# Convention de Commits (Conventional Commits)

## Format

```
<type>(<scope>): <description>
```

## Types

| Type       | Usage                                   | Exemple                                    |
| ---------- | --------------------------------------- | ------------------------------------------ |
| `feat`     | Nouvelle fonctionnalité                 | `feat(api): add /v1/complete endpoint`     |
| `fix`      | Correction de bug                       | `fix(optimizer): handle empty context`     |
| `chore`    | Maintenance, tooling, config            | `chore: add husky pre-commit hooks`        |
| `docs`     | Documentation                           | `docs: update README with Docker setup`    |
| `test`     | Ajout ou modification de tests          | `test(budget): add firewall unit tests`    |
| `refactor` | Refactoring sans changement fonctionnel | `refactor(router): extract scoring logic`  |
| `perf`     | Amélioration de performance             | `perf(cache): add Redis semantic cache`    |
| `ci`       | CI/CD pipeline changes                  | `ci: add Playwright E2E to GitHub Actions` |
| `style`    | Formatage, espacements                  | `style: run prettier on all files`         |

## Règles

- Description en anglais, impératif présent : `add`, `fix`, `update` — pas `added`, `fixes`
- Scope optionnel mais recommandé pour les changements ciblés : `(api)`, `(auth)`, `(optimizer)`
- Pas de majuscule en début de description
- Pas de point final
- Longueur max : 72 caractères pour la première ligne
