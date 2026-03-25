# Design Document — sdk-node-examples

## Overview

`examples/node-sdk/` is a subdirectory of the `examples/` multi-stack standalone git repository. It provides 11 self-contained TypeScript examples covering every public method and feature of the `@gatectr/sdk` Node.js SDK. It mirrors the DevOps toolchain of `sdk-node/` (pnpm, TypeScript 5 strict, ESLint, Prettier, Husky, Conventional Commits, GitHub Actions CI).

Two purposes:
1. **Developer quickstart** — `cd examples/node-sdk`, install, set `GATECTR_API_KEY`, run any example with `tsx`
2. **Living reference** — each file demonstrates one SDK capability with inline comments explaining every option and response field

The `examples/` repo is already excluded from the main platform's git via the root `.gitignore` (`/examples/`). It has its own commit history and its own CI pipeline.

---

## Architecture

```
examples/                          ← standalone git repo root (git init here)
├── node-sdk/                      ← Node.js SDK examples (this spec)
│   ├── .github/workflows/         ← ci.yml + pr-checks.yml (mirrors sdk-node/)
│   ├── .husky/                    ← pre-commit (lint-staged) + commit-msg (commitlint)
│   ├── examples/                  ← all 11 runnable .ts files
│   │   ├── 01-client-setup.ts
│   │   ├── 02-complete.ts
│   │   ├── 03-chat.ts
│   │   ├── 04-streaming.ts
│   │   ├── 05-models.ts
│   │   ├── 06-usage.ts
│   │   ├── 07-error-handling.ts
│   │   ├── 08-per-request-options.ts
│   │   ├── 09-context-optimizer.ts
│   │   ├── 10-budget-firewall.ts
│   │   └── 11-model-router.ts
│   ├── .env.example
│   ├── .gitignore
│   ├── .prettierrc                ← identical to sdk-node/
│   ├── commitlint.config.mjs      ← identical to sdk-node/
│   ├── eslint.config.mjs          ← adapted from sdk-node/ (targets examples/**)
│   ├── package.json               ← @gatectr/sdk dep, tsx/typescript devDeps
│   ├── pnpm-lock.yaml
│   ├── README.md
│   └── tsconfig.json              ← strict, ESNext, bundler resolution
├── python-sdk/                    ← future Python SDK examples
├── nextjs-app/                    ← already in examples/README.md
├── langchain-agent/
├── fastapi-service/
├── express-proxy/
├── budget-alert/
└── README.md                      ← global index (already exists)
```

### Key architectural decisions

**`node-sdk/` as a subdirectory, not the repo root**: `examples/` is a multi-stack repo. Each stack gets its own subdirectory (`node-sdk/`, `python-sdk/`, etc.) with its own `package.json`, toolchain, and CI. The git repo is initialized at `examples/` root, shared across all stacks.

**`tsx` as the runner**: No compile step. Developers run `tsx examples/01-client-setup.ts` from inside `node-sdk/`. Frictionless DX, matches how most developers prototype with TypeScript today.

**No test/coverage job in CI**: Examples are typechecked, not unit-tested. The CI `validate` job checks that all 11 expected files exist under `examples/node-sdk/examples/`. Sufficient to catch regressions without mocking the GateCtr API.

**`@gatectr/sdk` as a regular dependency**: Declared in `dependencies` (not `devDependencies`) because it is imported at runtime. Version pinned to latest published release.

**No publish workflow**: Unlike `sdk-node/`, there is no npm publish. No `changeset`, no `release` script. CI is typecheck + lint + validate only.

---

## Components and Interfaces

### Package configuration (`examples/node-sdk/package.json`)

```json
{
  "name": "sdk-node-examples",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "packageManager": "pnpm@10.x",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint examples/",
    "format": "prettier --write .",
    "prepare": "husky"
  },
  "dependencies": {
    "@gatectr/sdk": "^0.2.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0",
    "@commitlint/cli": "^19.0.0",
    "@commitlint/config-conventional": "^19.0.0"
  },
  "lint-staged": {
    "examples/**/*.ts": ["eslint --fix", "prettier --write"]
  }
}
```

### TypeScript configuration (`examples/node-sdk/tsconfig.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["examples/**/*.ts"]
}
```

`"module": "ESNext"` + `"moduleResolution": "bundler"` matches how `tsx` resolves modules. `"target": "ES2022"` enables top-level `await` without a wrapper function.

### ESLint configuration (`examples/node-sdk/eslint.config.mjs`)

Adapted from `sdk-node/eslint.config.mjs`. Key difference: `files` targets `examples/**/*.ts` instead of `src/**/*.ts`. Uses `@typescript-eslint/eslint-plugin` with `strict-type-checked` rules. `parserOptions.project` points to `./tsconfig.json`.

### CI workflow (`examples/node-sdk/.github/workflows/ci.yml`)

Three parallel jobs:
- `lint` — runs `pnpm lint` (ESLint) + `pnpm exec prettier --check .`
- `typecheck` — runs `pnpm typecheck` (tsc --noEmit)
- `validate` — shell script asserting all 11 expected example files exist under `examples/`

All jobs: Node 22, `pnpm/action-setup@v4`, `pnpm install --frozen-lockfile`. Triggers on push and pull_request to `main` and `develop`. Working directory scoped to `node-sdk/`.

### PR checks workflow (`examples/node-sdk/.github/workflows/pr-checks.yml`)

Identical to `sdk-node/.github/workflows/pr-checks.yml`:
- `pr-title` — `amannn/action-semantic-pull-request@v5`
- `conflict-check` — checks `pr.mergeable !== false`

### Example files (`examples/node-sdk/examples/01–11`)

Each file is a self-contained TypeScript module with top-level `await`. Structure:

```typescript
// examples/NN-feature-name.ts
// One-line description of what this example demonstrates.

import { GateCtr, /* error classes */ } from "@gatectr/sdk";

const client = new GateCtr(); // reads GATECTR_API_KEY from env

// Main logic
// ...

// Output to stdout
```

| File | SDK method(s) | Feature |
|------|--------------|---------|
| `01-client-setup.ts` | `new GateCtr(config)` | All constructor options, `GateCtrConfigError` |
| `02-complete.ts` | `client.complete()` | Text completion, `GateCtrMetadata` |
| `03-chat.ts` | `client.chat()` | Multi-turn chat, message format |
| `04-streaming.ts` | `client.stream()` | `for await`, `AbortController`, `GateCtrStreamError` |
| `05-models.ts` | `client.models()` | Model enumeration |
| `06-usage.ts` | `client.usage()` | Date-range filtering, usage breakdown |
| `07-error-handling.ts` | all methods | All 5 error classes, `instanceof` checks |
| `08-per-request-options.ts` | `client.complete()` / `client.chat()` | `gatectr: { budgetId, optimize, route }` |
| `09-context-optimizer.ts` | `client.complete()` | `optimize: true/false`, `tokensSaved` comparison |
| `10-budget-firewall.ts` | `client.complete()` | `budget_exceeded` error, graceful fallback |
| `11-model-router.ts` | `client.chat()` | `route: true`, `modelUsed`, per-request override |

---

## Data Models

No data models of its own — consumes the `@gatectr/sdk` type system directly.

**`GateCtrConfig`** — constructor options:
- `apiKey?: string` — falls back to `GATECTR_API_KEY` env var
- `baseUrl?: string` — default: `"https://api.gatectr.com/v1"`
- `timeout?: number` — ms, default: 30000
- `maxRetries?: number` — default: 3
- `optimize?: boolean` — Context Optimizer, default: true
- `route?: boolean` — Model Router, default: false

**`GateCtrMetadata`** — present on every response as `.gatectr`:
- `requestId: string`
- `latencyMs: number`
- `overage: boolean`
- `modelUsed: string`
- `tokensSaved: number`

**`PerRequestOptions`** — passed as `params.gatectr`:
- `budgetId?: string`
- `optimize?: boolean`
- `route?: boolean`

**Error classes** (all extend `GateCtrError`):
- `GateCtrConfigError` — invalid/missing config
- `GateCtrApiError` — non-2xx HTTP; has `.status`, `.code`, `.requestId`
- `GateCtrTimeoutError` — timeout exceeded; has `.timeoutMs`
- `GateCtrStreamError` — stream failed mid-stream
- `GateCtrNetworkError` — DNS/transport failure

**Environment variables** (in `.env.example`):
- `GATECTR_API_KEY` — required
- `GATECTR_BASE_URL` — optional override

---

## Correctness Properties

### Property 1: TypeScript strict-mode compliance

For any example file in `examples/node-sdk/examples/`, running `tsc --noEmit` with the `tsconfig.json` (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes) should produce zero errors.

**Validates: Requirements 3.1, 3.5, 4.4, 5.4, 6.4, 7.6, 8.3, 9.4, 10.6, 11.4, 12.4, 13.5, 14.5**

### Property 2: All expected example files exist

All 11 expected example files (`01-client-setup.ts` through `11-model-router.ts`) must be present under `examples/node-sdk/examples/`.

**Validates: Requirements 1.3, 4.1, 5.1, 6.1, 7.1, 8.1, 9.1, 10.1, 11.1, 12.1, 13.1, 14.1**

### Property 3: Empty API key is rejected

Any `GateCtr` constructor call with an empty or whitespace-only `apiKey` should throw `GateCtrConfigError`.

**Validates: Requirements 4.3, 10.4**

### Property 4: Error discrimination via instanceof

`instanceof` checks against the five error classes correctly identify error types without string matching.

**Validates: Requirement 10.5**

### Property 5: Per-request options override client defaults

A client with `optimize: true, route: false` and a request with `gatectr: { optimize: false, route: true }` should use the per-request values.

**Validates: Requirements 11.1, 11.3**

### Property 6: Lint and format pass on all example files

Running ESLint and Prettier check on all files in `examples/node-sdk/examples/` produces zero errors.

**Validates: Requirements 15.1, 15.2, 16.2**

---

## Error Handling

### Missing API key
`GateCtr` throws `GateCtrConfigError` synchronously. Demonstrated in `01-client-setup.ts`.

### API errors (4xx/5xx)
`GateCtrApiError` with `.code` values: `"budget_exceeded"`, `"rate_limit_exceeded"`, `"unauthorized"`, `"not_found"`. Demonstrated in `07-error-handling.ts` and `10-budget-firewall.ts`.

### Timeout
`GateCtrTimeoutError` with `.timeoutMs`. Demonstrated in `07-error-handling.ts`.

### Stream errors
`GateCtrStreamError` wraps the `for await` loop in `04-streaming.ts`.

### Network errors
`GateCtrNetworkError` catch branch in `07-error-handling.ts`.

### AbortSignal
`04-streaming.ts` creates an `AbortController`, passes `signal` to `client.stream()`, aborts after a timeout.

---

## Testing Strategy

Typecheck-only validation — no unit tests, no test runner. Correctness validated through:

1. **TypeScript strict typecheck** — `pnpm typecheck` catches incorrect signatures, missing params, type mismatches
2. **ESLint + Prettier** — `pnpm lint` + `prettier --check` catch unsafe patterns and formatting
3. **File existence validation** — CI `validate` job asserts all 11 files exist
4. **Pre-commit hooks** — Husky runs `lint-staged` + `commitlint` locally

No `vitest` or `fast-check` — adding a test runner would be scope creep for a documentation repo.
