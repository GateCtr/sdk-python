---
inclusion: always
---

# GateCtr Copywriting Rules

## CTA Copy by Context

| Context         | Primary CTA                   | Secondary CTA           | Tone                       |
| --------------- | ----------------------------- | ----------------------- | -------------------------- |
| Hero page       | `Start for free`              | `See how it works`      | Confident, direct          |
| Pricing page    | `Start free — No card needed` | `Compare plans`         | Reassuring, no friction    |
| Landing dev     | `npm install @gatectr/sdk`    | `View docs`             | Technical, actionable      |
| Empty dashboard | `Connect your first LLM`      | `Import existing key`   | Guiding, simple            |
| Budget alert    | `Upgrade to Pro`              | `Adjust limits`         | Urgent but caring          |
| Onboarding      | `Set up your first project`   | `Skip for now`          | Progressive, non-intrusive |
| Enterprise      | `Book a demo`                 | `Download overview PDF` | Professional, serious      |
| Email nurture   | `See your token savings`      | `View full report`      | Data-driven, curiosity     |
| Offboarding     | `Pause my plan`               | `Talk to support`       | Empathetic, non-aggressive |

## Rules

### Primary CTA

- One per view. Action-first. Outcome-implied.
- Never vague: `"Start free"` not `"Get started"`
- Dev contexts: use the actual command — `npm install @gatectr/sdk`

### Secondary CTA

- Always less visually prominent than primary (`cta-secondary` or `cta-ghost`)
- Offers an alternative path, never competes with primary
- Offboarding: secondary must be softer than primary — never push churn

### Tone per context

- Hero / Pricing: confident, no hedging, lead with value
- Dev landing: technical and direct — devs scan, they don't read
- Dashboard empty state: guiding, not pushy — user just arrived
- Budget alert: create urgency without panic — give an out (`Adjust limits`)
- Onboarding: respect their time, always offer a skip
- Enterprise: formal, no slang, PDF download signals seriousness
- Email: data first, curiosity second — `"See your token savings"` implies there's something worth seeing
- Offboarding: never aggressive, `"Pause"` is softer than `"Cancel"`, always offer support

## Bilingual Equivalents (EN → FR)

| EN                            | FR                                |
| ----------------------------- | --------------------------------- |
| `Start for free`              | `Démarrer gratuitement`           |
| `See how it works`            | `Voir comment ça marche`          |
| `Start free — No card needed` | `Démarrer — Sans carte requise`   |
| `Compare plans`               | `Comparer les offres`             |
| `npm install @gatectr/sdk`    | _(keep as-is — technical term)_   |
| `View docs`                   | `Voir la documentation`           |
| `Connect your first LLM`      | `Connecter votre premier LLM`     |
| `Import existing key`         | `Importer une clé existante`      |
| `Upgrade to Pro`              | `Passer à Pro`                    |
| `Adjust limits`               | `Ajuster les limites`             |
| `Set up your first project`   | `Configurer votre premier projet` |
| `Skip for now`                | `Passer pour l'instant`           |
| `Book a demo`                 | `Réserver une démo`               |
| `Download overview PDF`       | `Télécharger le PDF`              |
| `See your token savings`      | `Voir vos économies de tokens`    |
| `View full report`            | `Voir le rapport complet`         |
| `Pause my plan`               | `Mettre en pause`                 |
| `Talk to support`             | `Contacter le support`            |

## Anti-patterns

```
❌ "Get started today!"       → ✅ "Start free"
❌ "Click here to learn more" → ✅ "See how it works"
❌ "Cancel my subscription"   → ✅ "Pause my plan"
❌ "Submit"                   → ✅ "Set up your first project"
❌ "Confirm"                  → ✅ "Upgrade to Pro" / "Delete project"
❌ "Yes, continue"            → ✅ state the actual action
```
