# Requirements Document

## Introduction

`examples/node-sdk/` is the Node.js SDK examples subdirectory inside the `examples/` multi-stack repository. The `examples/` directory is a standalone git repo already excluded from the main platform's git tracking via `.gitignore`. The Node.js SDK examples live in `examples/node-sdk/` and mirror the exact DevOps toolchain of `sdk-node/` (pnpm, TypeScript 5 strict, ESLint, Prettier, Husky, Conventional Commits, GitHub Actions CI). Each example is a self-contained `.ts` file executable with `tsx`, covering every public method of the SDK: `complete()`, `chat()`, `stream()`, `models()`, `usage()`, error handling, per-request options, and the Context Optimizer / Budget Firewall / Model Router features. The subdirectory serves as both a developer quickstart and a living reference for GateCtr's Node.js SDK capabilities.

---

## Glossary

- **Examples_Repo**: The `examples/` multi-stack standalone git repository. Already excluded from the main platform's git tracking via the root `.gitignore`.
- **NodeSDK_Dir**: The `examples/node-sdk/` subdirectory — the subject of this spec. Contains all Node.js SDK examples and their toolchain.
- **SDK**: The `@gatectr/sdk` npm package, imported as a dependency by the NodeSDK_Dir.
- **Client**: The `GateCtr` class instantiated in each example file.
- **Example_File**: A single `.ts` file under `examples/node-sdk/examples/` that demonstrates one SDK feature or use case, runnable with `tsx`.
- **Runner**: The `tsx` CLI used to execute Example_Files directly without a separate compile step.
- **Toolchain**: The set of dev tools shared with `sdk-node/`: pnpm, TypeScript 5, ESLint, Prettier, Husky, lint-staged, commitlint.
- **CI_Workflow**: The GitHub Actions workflow that lints, typechecks, and validates examples on every push and PR.
- **PR_Checks_Workflow**: The GitHub Actions workflow that validates PR titles (Conventional Commits) and checks for merge conflicts.
- **Context_Optimizer**: The GateCtr feature that compresses prompts to reduce token usage by ~40%, enabled via `optimize: true`.
- **Budget_Firewall**: The GateCtr feature that enforces hard token/cost caps per project, surfaced via `GateCtrApiError` with `code: "budget_exceeded"`.
- **Model_Router**: The GateCtr feature that auto-selects the optimal LLM by cost/performance, enabled via `route: true`.
- **GateCtr_Metadata**: The `gatectr` field on every SDK response: `{ requestId, latencyMs, overage, modelUsed, tokensSaved }`.

---

## Requirements

### Requirement 1: Repository Identity and Structure

**User Story:** As a developer, I want to navigate to `examples/node-sdk/` and immediately understand its layout, so that I can find and run any example in under a minute.

#### Acceptance Criteria

1. THE Examples_Repo (`examples/`) SHALL be a standalone git repository initialized with `git init`, with its own commit history independent of the parent workspace. The `examples/` directory is already excluded from the main platform's git via the root `.gitignore`.
2. THE Examples_Repo SHALL have an initial commit on `main` with the message `chore: initial examples scaffold`, containing all scaffolded files.
3. THE NodeSDK_Dir SHALL be located at `examples/node-sdk/` and contain an `examples/` subdirectory where all 11 Example_Files reside.
4. THE NodeSDK_Dir SHALL contain a `README.md` documenting: installation steps, how to set the `GATECTR_API_KEY` environment variable, and how to run any example with `tsx`.
5. THE NodeSDK_Dir SHALL contain a `.gitignore` that excludes `node_modules/`, `.env`, and `*.js` build artifacts.
6. THE NodeSDK_Dir SHALL contain a `.env.example` file listing all required environment variables with placeholder values and inline comments.

---

### Requirement 2: Package Configuration

**User Story:** As a developer, I want a `package.json` in `examples/node-sdk/` that installs all dependencies with a single `pnpm install`, so that I can run examples without manual setup.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL declare `@gatectr/sdk` as a dependency in `package.json`.
2. THE NodeSDK_Dir SHALL declare `tsx` and `typescript` as `devDependencies`.
3. THE NodeSDK_Dir SHALL declare `"engines": { "node": ">=22" }` in `package.json`, matching the SDK's Node.js requirement.
4. THE NodeSDK_Dir SHALL set `"packageManager": "pnpm@10.x"` in `package.json`.
5. THE NodeSDK_Dir SHALL include a `scripts` section with at minimum:
   - `"typecheck"`: runs `tsc --noEmit` to validate all example files.
   - `"lint"`: runs ESLint on the `examples/` directory.
   - `"format"`: runs Prettier with `--write` on all files.
6. THE NodeSDK_Dir SHALL commit a `pnpm-lock.yaml` file so installs are reproducible.

---

### Requirement 3: TypeScript Configuration

**User Story:** As a developer, I want TypeScript strict mode enabled, so that examples demonstrate type-safe SDK usage and catch mistakes at compile time.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL include a `tsconfig.json` with `"strict": true`, `"noUncheckedIndexedAccess": true`, and `"exactOptionalPropertyTypes": true`.
2. THE `tsconfig.json` SHALL set `"module": "ESNext"` and `"moduleResolution": "bundler"` to match modern Node.js ESM resolution used by `tsx`.
3. THE `tsconfig.json` SHALL set `"target": "ES2022"` or higher to support top-level `await` in example files.
4. THE `tsconfig.json` SHALL include `"include": ["examples/**/*.ts"]` so only example files are typechecked.
5. IF a TypeScript error exists in any Example_File, THEN THE `typecheck` script SHALL exit with a non-zero code, causing CI to fail.

---

### Requirement 4: Example — Client Instantiation

**User Story:** As a developer, I want an example showing all `GateCtr` constructor options, so that I understand how to configure the client for my use case.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL contain `examples/node-sdk/examples/01-client-setup.ts` demonstrating:
   - Instantiation using the `GATECTR_API_KEY` environment variable (no explicit `apiKey` in code).
   - Instantiation with all optional config fields: `baseUrl`, `timeout`, `maxRetries`, `optimize`, `route`.
2. THE example SHALL include inline comments explaining each config option and its default value.
3. THE example SHALL demonstrate the `GateCtrConfigError` thrown when no API key is available, using a `try/catch` block.
4. WHEN `examples/node-sdk/examples/01-client-setup.ts` is typechecked, THE TypeScript compiler SHALL report zero errors.

---

### Requirement 5: Example — Text Completion (`complete()`)

**User Story:** As a developer, I want a runnable example of `client.complete()`, so that I can see the full request/response cycle including GateCtr metadata.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL contain `examples/node-sdk/examples/02-complete.ts` that calls `client.complete()` with a `model`, a `messages` array, and optional `max_tokens` and `temperature`.
2. THE example SHALL log `response.choices[0]?.text` and the full `response.gatectr` metadata object to stdout.
3. THE example SHALL include a comment explaining each field of `GateCtr_Metadata` (`requestId`, `latencyMs`, `overage`, `modelUsed`, `tokensSaved`).
4. WHEN `examples/node-sdk/examples/02-complete.ts` is typechecked, THE TypeScript compiler SHALL report zero errors.

---

### Requirement 6: Example — Chat Completion (`chat()`)

**User Story:** As a developer, I want a runnable example of `client.chat()` with a multi-turn conversation, so that I can see how to build chat-style interactions.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL contain `examples/node-sdk/examples/03-chat.ts` that calls `client.chat()` with a `system` message and at least two `user`/`assistant` turns in the `messages` array.
2. THE example SHALL log `response.choices[0]?.message.content` and `response.gatectr.modelUsed` to stdout.
3. THE example SHALL demonstrate the OpenAI-compatible message format (`{ role, content }`).
4. WHEN `examples/node-sdk/examples/03-chat.ts` is typechecked, THE TypeScript compiler SHALL report zero errors.

---

### Requirement 7: Example — Streaming (`stream()`)

**User Story:** As a developer, I want a runnable streaming example, so that I can see how to display LLM output token by token using `for await`.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL contain `examples/node-sdk/examples/04-streaming.ts` that calls `client.stream()` and iterates over chunks with `for await (const chunk of client.stream(...))`.
2. THE example SHALL write each `chunk.delta` to `process.stdout` without a newline, producing a live-streaming effect.
3. THE example SHALL handle stream termination by printing a newline after the loop ends.
4. THE example SHALL demonstrate `AbortSignal` usage: create an `AbortController`, pass `signal` to `stream()`, and abort after a timeout.
5. THE example SHALL include a `try/catch` block catching `GateCtrStreamError`.
6. WHEN `examples/node-sdk/examples/04-streaming.ts` is typechecked, THE TypeScript compiler SHALL report zero errors.

---

### Requirement 8: Example — List Models (`models()`)

**User Story:** As a developer, I want an example of `client.models()`, so that I can see how to enumerate available models and their capabilities.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL contain `examples/node-sdk/examples/05-models.ts` that calls `client.models()` and prints each model's `modelId`, `provider`, `contextWindow`, and `capabilities` to stdout.
2. THE example SHALL log the `requestId` from the response.
3. WHEN `examples/node-sdk/examples/05-models.ts` is typechecked, THE TypeScript compiler SHALL report zero errors.

---

### Requirement 9: Example — Usage Statistics (`usage()`)

**User Story:** As a developer, I want an example of `client.usage()` with date range filtering, so that I can see how to retrieve and display token consumption data.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL contain `examples/node-sdk/examples/06-usage.ts` that calls `client.usage()` with `from` and `to` ISO date strings.
2. THE example SHALL log `totalTokens`, `totalRequests`, `totalCostUsd`, `savedTokens`, and the `byProject` breakdown to stdout.
3. THE example SHALL include a comment explaining the `from`/`to` date format (`YYYY-MM-DD`).
4. WHEN `examples/node-sdk/examples/06-usage.ts` is typechecked, THE TypeScript compiler SHALL report zero errors.

---

### Requirement 10: Example — Error Handling

**User Story:** As a developer, I want a comprehensive error handling example, so that I can write precise `catch` branches for every SDK error type.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL contain `examples/node-sdk/examples/07-error-handling.ts` demonstrating `catch` branches for all exported error classes: `GateCtrApiError`, `GateCtrTimeoutError`, `GateCtrNetworkError`, `GateCtrStreamError`, and `GateCtrConfigError`.
2. THE example SHALL show how to read `err.status`, `err.code`, and `err.requestId` from a `GateCtrApiError`.
3. THE example SHALL show how to read `err.timeoutMs` from a `GateCtrTimeoutError`.
4. THE example SHALL demonstrate triggering a `GateCtrConfigError` by constructing a client with an empty `apiKey`.
5. THE example SHALL use `instanceof` checks in the `catch` block, not string matching on `err.message`.
6. WHEN `examples/node-sdk/examples/07-error-handling.ts` is typechecked, THE TypeScript compiler SHALL report zero errors.

---

### Requirement 11: Example — Per-Request Options

**User Story:** As a developer, I want an example of per-request `gatectr` options, so that I can override client-level settings on individual calls.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL contain `examples/node-sdk/examples/08-per-request-options.ts` that calls `client.complete()` or `client.chat()` with a `gatectr` field containing `budgetId`, `optimize`, and `route` overrides.
2. THE example SHALL include comments explaining when to use per-request overrides vs. client-level defaults.
3. THE example SHALL demonstrate both enabling and disabling `optimize` and `route` per-request.
4. WHEN `examples/node-sdk/examples/08-per-request-options.ts` is typechecked, THE TypeScript compiler SHALL report zero errors.

---

### Requirement 12: Example — Context Optimizer

**User Story:** As a developer, I want an example that highlights the Context Optimizer feature, so that I can see how token savings are reported and how to enable/disable optimization.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL contain `examples/node-sdk/examples/09-context-optimizer.ts` that makes two `client.complete()` calls with identical prompts: one with `optimize: true` and one with `optimize: false`.
2. THE example SHALL log `response.gatectr.tokensSaved` for each call and print a comparison to stdout.
3. THE example SHALL include a comment explaining that the Context Optimizer is a GateCtr Pro feature that compresses prompts by ~40%.
4. WHEN `examples/node-sdk/examples/09-context-optimizer.ts` is typechecked, THE TypeScript compiler SHALL report zero errors.

---

### Requirement 13: Example — Budget Firewall

**User Story:** As a developer, I want an example showing how the Budget Firewall surfaces in the SDK, so that I can handle budget-exceeded errors gracefully in my application.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL contain `examples/node-sdk/examples/10-budget-firewall.ts` that demonstrates catching a `GateCtrApiError` with `code === "budget_exceeded"` or `code === "rate_limit_exceeded"`.
2. THE example SHALL show how to read `err.status` (429) and `err.requestId` from the caught error.
3. THE example SHALL include a comment explaining the Budget Firewall feature: hard caps per project, no surprise invoices.
4. THE example SHALL show a graceful fallback pattern (e.g., logging the error and returning a default response) rather than crashing.
5. WHEN `examples/node-sdk/examples/10-budget-firewall.ts` is typechecked, THE TypeScript compiler SHALL report zero errors.

---

### Requirement 14: Example — Model Router

**User Story:** As a developer, I want an example showing how to enable the Model Router, so that I can let GateCtr auto-select the optimal LLM for each request.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL contain `examples/node-sdk/examples/11-model-router.ts` that instantiates a Client with `route: true` and calls `client.chat()`.
2. THE example SHALL log `response.gatectr.modelUsed` to show which model GateCtr selected.
3. THE example SHALL include a comment explaining the Model Router feature: semantic complexity scoring, cost + latency optimization.
4. THE example SHALL demonstrate overriding the router for a specific call using `gatectr: { route: false }` in the request.
5. WHEN `examples/node-sdk/examples/11-model-router.ts` is typechecked, THE TypeScript compiler SHALL report zero errors.

---

### Requirement 15: Code Quality Toolchain

**User Story:** As a maintainer, I want the same linting, formatting, and commit conventions as `sdk-node/`, so that contributions follow a consistent, reviewable standard.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL include an ESLint configuration (`eslint.config.mjs`) using `@typescript-eslint/eslint-plugin` with strict TypeScript rules, identical in structure to `sdk-node/eslint.config.mjs`.
2. THE NodeSDK_Dir SHALL include a Prettier configuration (`.prettierrc`) with the same formatting rules as `sdk-node/`.
3. THE NodeSDK_Dir SHALL include Husky with a `pre-commit` hook that runs `lint-staged` to lint and format staged `.ts` files before every commit.
4. THE NodeSDK_Dir SHALL include a `commitlint` configuration enforcing Conventional Commits (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `style`).
5. THE NodeSDK_Dir SHALL include a `commit-msg` Husky hook that runs `commitlint` on every commit message.

---

### Requirement 16: CI — GitHub Actions

**User Story:** As a maintainer, I want GitHub Actions CI that validates all examples on every push and PR, so that broken examples are caught before they reach `main`.

#### Acceptance Criteria

1. THE NodeSDK_Dir SHALL include `.github/workflows/ci.yml` that triggers on `push` and `pull_request` events targeting `main` and `develop`.
2. THE CI_Workflow SHALL run three jobs in parallel: `lint` (ESLint + Prettier check), `typecheck` (tsc --noEmit), and `validate` (verify all 11 Example_Files exist under `examples/node-sdk/examples/`).
3. THE CI_Workflow SHALL use Node.js 22 and pnpm, matching `sdk-node/`'s CI configuration.
4. THE CI_Workflow SHALL use `pnpm install --frozen-lockfile` to ensure reproducible installs.
5. THE NodeSDK_Dir SHALL include `.github/workflows/pr-checks.yml` that validates PR titles against Conventional Commits format and checks for merge conflicts, identical in structure to `sdk-node/.github/workflows/pr-checks.yml`.

---

### Requirement 17: Git Repository and Branching Strategy

**User Story:** As a maintainer, I want the examples repo to follow the same branching strategy as `sdk-node/`, so that contributions are managed consistently.

#### Acceptance Criteria

1. THE Examples_Repo SHALL have two permanent protected branches: `main` (stable) and `develop` (integration). NEITHER branch SHALL ever be deleted.
2. ALL feature development SHALL follow this flow: create a `feat/<name>` branch from `develop` → commit → open a PR into `develop` → merge with merge commit → delete the feature branch.
3. NO direct pushes SHALL be made to `main` or `develop` — all changes MUST go through a Pull Request.
4. Branch naming conventions SHALL mirror `sdk-node/`:
   - `feat/<name>` — new examples or features
   - `fix/<name>` — corrections to existing examples
   - `chore/<name>` — tooling and maintenance
   - `docs/<name>` — README and documentation updates
5. THE CI_Workflow SHALL run on push and pull_request events targeting both `main` and `develop`.
