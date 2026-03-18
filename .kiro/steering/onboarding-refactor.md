# Onboarding Refactor Plan

## Objectif

Transformer l'onboarding actuel (formulaire générique) en un flow en 3 étapes qui crée de la valeur immédiatement et reflète le core product GateCtr.

## Problèmes actuels

- Collecte `useCase` et `teamSize` — données non utilisées dans le produit à ce stade
- Pas de connexion LLM provider → dashboard vide après onboarding, zéro valeur perçue
- Pas de budget initial → la feature #1 du Free plan (Budget Firewall) n'est pas activée
- Une seule page/étape → pas de progression, sentiment de formulaire admin

## Flow cible : 3 étapes

### Étape 1 — Workspace

**Objectif** : Créer le workspace et qualifier l'usage

Champs :

- `workspaceName` (string, required) — nom du workspace / projet
- `usageType` (enum) — `solo` | `team` | `enterprise`

Actions backend :

- Créer la `Team` en DB
- Stocker `activeTeamId` dans `user.metadata`
- Mettre `onboardingComplete: false` (pas encore terminé)

Supprimé vs actuel :

- `useCase` → déplacer dans Settings > Workspace plus tard
- `teamSize` → inutile, se déduit des membres invités

---

### Étape 2 — Connecter un LLM provider

**Objectif** : Le "aha moment" — sans ça, rien ne fonctionne

Champs :

- `provider` (enum) — `openai` | `anthropic` | `mistral` | `gemini`
- `apiKey` (string, required) — clé API du provider choisi
- `keyName` (string, optional, default: "Default") — nom pour identifier la clé

UI :

- Sélecteur de provider avec logo + nom
- Input masqué pour la clé (type password)
- Lien "Where to find my key?" → doc externe du provider
- Validation en temps réel (format de clé basique)

Actions backend :

- Chiffrer la clé AES → stocker dans `LLMProviderKey`
- Associer au `userId` et au `teamId` actif

Note : Cette étape peut être skippée ("Set up later") mais avec un warning clair :

> "Without a provider key, GateCtr can't route your requests."

---

### Étape 3 — Budget initial

**Objectif** : Activer le Budget Firewall immédiatement — différenciateur #1

Champs :

- `monthlyTokenLimit` (number, optional) — ex: 50 000 tokens/mois (Free plan default)
- `alertThreshold` (number, default: 80) — % d'alerte (80% par défaut)
- `hardStop` (boolean, default: true) — bloquer les requêtes si limite atteinte

UI :

- Slider ou input numérique pour la limite
- Toggle pour hard stop vs soft alert
- Afficher le plan actuel et sa limite max (depuis `lib/plan-vars.ts`)
- Message contextuel : "Free plan includes 50K tokens/month. Upgrade anytime."

Actions backend :

- Créer ou mettre à jour `Budget` en DB (lié au `userId`)
- Marquer `onboardingComplete: true` dans `user.metadata` DB
- Mettre à jour `publicMetadata` Clerk : `{ onboardingComplete: true }`

---

## Architecture technique

### État du flow

Stocker l'étape courante en state local React (pas en DB) — l'onboarding n'est fait qu'une fois.

```typescript
type OnboardingStep = "workspace" | "provider" | "budget";
```

### Composants à créer

```
app/[locale]/onboarding/
├── page.tsx                    # Orchestrateur du flow (état + navigation)
├── _actions.ts                 # Server actions (une par étape)
├── steps/
│   ├── workspace-step.tsx      # Étape 1
│   ├── provider-step.tsx       # Étape 2
│   └── budget-step.tsx         # Étape 3
```

### Server actions

- `createWorkspace(formData)` — étape 1 (extrait de l'actuel `completeOnboarding`)
- `connectProvider(formData)` — étape 2 (nouveau)
- `setupBudget(formData)` — étape 3 (nouveau, finalise l'onboarding)

### Dépendances à implémenter avant

- `lib/encryption.ts` — AES encrypt/decrypt pour les clés API (nécessaire étape 2)
- `LLMProviderKey` model — déjà dans le schema Prisma ✅
- `Budget` model — déjà dans le schema Prisma ✅

---

## UX / Design

### Progress indicator

Barre de progression en haut : `Step 1 of 3` avec les labels des étapes

### Navigation

- "Continue" → étape suivante
- "Back" → étape précédente (sans perte de données)
- "Skip" → uniquement sur l'étape 2 (provider), avec warning

### Copy (brand voice)

```
Étape 1 : "Set up your workspace. 30 seconds."
Étape 2 : "Connect your first LLM. Your key stays yours."
Étape 3 : "Set your budget. No surprise invoices."
```

### Traductions

Créer/mettre à jour :

- `messages/en/onboarding.json`
- `messages/fr/onboarding.json`

---

## Ce qui ne change pas

- Guard idempotent dans `_actions.ts` (si `onboardingComplete === true` → skip)
- Redirect post-onboarding via `window.location.href` (full reload pour JWT frais)
- `publicMetadata` Clerk = uniquement `{ onboardingComplete: true }` — pas de données métier

---

## Ordre d'implémentation suggéré

1. `lib/encryption.ts` — AES pour les clés LLM
2. Refactorer `page.tsx` en orchestrateur multi-étapes
3. `steps/workspace-step.tsx` — reprendre l'actuel, simplifier
4. `steps/provider-step.tsx` + `connectProvider()` action
5. `steps/budget-step.tsx` + `setupBudget()` action
6. Mettre à jour les traductions EN/FR
