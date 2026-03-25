# Tasks — sdk-node-examples

## Task List

- [-] 1. Initialize standalone git repository
  - [x] 1.1 Run `git init` inside `examples/` (if not already initialized), create `main` and `develop` branches
  - [ ] 1.2 Create initial commit `chore: initial examples scaffold` on `main` containing all scaffolded files

- [x] 2. Scaffold package configuration
  - [x] 2.1 Create `examples/node-sdk/package.json` with `@gatectr/sdk` dependency, `tsx`/`typescript`/ESLint/Prettier/Husky/commitlint devDependencies, `engines: { node: ">=22" }`, `packageManager: "pnpm@10.x"`, and `scripts` (`typecheck`, `lint`, `format`, `prepare`)
  - [x] 2.2 Create `examples/node-sdk/pnpm-lock.yaml` by running `pnpm install` inside `examples/node-sdk/`

- [x] 3. Configure TypeScript
  - [x] 3.1 Create `examples/node-sdk/tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `module: "ESNext"`, `moduleResolution: "bundler"`, `target: "ES2022"`, and `include: ["examples/**/*.ts"]`

- [x] 4. Configure code quality toolchain
  - [x] 4.1 Create `examples/node-sdk/eslint.config.mjs` using `@typescript-eslint/eslint-plugin` with `strict-type-checked` rules, targeting `examples/**/*.ts`
  - [x] 4.2 Create `examples/node-sdk/.prettierrc` identical to `sdk-node/.prettierrc`
  - [x] 4.3 Create `examples/node-sdk/commitlint.config.mjs` identical to `sdk-node/commitlint.config.mjs`
  - [x] 4.4 Create `examples/node-sdk/.husky/pre-commit` hook running `lint-staged`
  - [x] 4.5 Create `examples/node-sdk/.husky/commit-msg` hook running `commitlint`

- [x] 5. Configure GitHub Actions CI
  - [x] 5.1 Create `examples/node-sdk/.github/workflows/ci.yml` with three parallel jobs: `lint` (ESLint + Prettier check), `typecheck` (tsc --noEmit), `validate` (assert all 11 example files exist under `examples/`) — Node 22, pnpm, `--frozen-lockfile`, working directory `node-sdk/`
  - [x] 5.2 Create `examples/node-sdk/.github/workflows/pr-checks.yml` identical in structure to `sdk-node/.github/workflows/pr-checks.yml`

- [x] 6. Create root files
  - [x] 6.1 Create `examples/node-sdk/.gitignore` excluding `node_modules/`, `.env`, `*.js` build artifacts
  - [x] 6.2 Create `examples/node-sdk/.env.example` with `GATECTR_API_KEY` and `GATECTR_BASE_URL` placeholder values and inline comments
  - [x] 6.3 Create `examples/node-sdk/README.md` documenting installation (`cd examples/node-sdk && pnpm install`), `GATECTR_API_KEY` setup, and how to run any example with `tsx examples/NN-name.ts`

- [x] 7. Write example files
  - [x] 7.1 Create `examples/node-sdk/examples/01-client-setup.ts` — all `GateCtr` constructor options with inline comments, `GateCtrConfigError` demo via `try/catch`
  - [x] 7.2 Create `examples/node-sdk/examples/02-complete.ts` — `client.complete()` with `model`, `messages`, `max_tokens`, `temperature`; log `choices[0]?.text` and full `gatectr` metadata with field comments
  - [x] 7.3 Create `examples/node-sdk/examples/03-chat.ts` — `client.chat()` with system message and two user/assistant turns; log `choices[0]?.message.content` and `gatectr.modelUsed`
  - [x] 7.4 Create `examples/node-sdk/examples/04-streaming.ts` — `for await` over `client.stream()`, write `chunk.delta` to `process.stdout`, `AbortController` timeout demo, `GateCtrStreamError` catch
  - [x] 7.5 Create `examples/node-sdk/examples/05-models.ts` — `client.models()`, print each model's `modelId`, `provider`, `contextWindow`, `capabilities`, and `requestId`
  - [x] 7.6 Create `examples/node-sdk/examples/06-usage.ts` — `client.usage()` with `from`/`to` ISO date strings; log `totalTokens`, `totalRequests`, `totalCostUsd`, `savedTokens`, `byProject`; comment on date format
  - [x] 7.7 Create `examples/node-sdk/examples/07-error-handling.ts` — `instanceof` catch branches for all five error classes; read `.status`, `.code`, `.requestId` from `GateCtrApiError`; read `.timeoutMs` from `GateCtrTimeoutError`; trigger `GateCtrConfigError` with empty `apiKey`
  - [x] 7.8 Create `examples/node-sdk/examples/08-per-request-options.ts` — `client.complete()` or `client.chat()` with `gatectr: { budgetId, optimize, route }`; demonstrate both enabling and disabling `optimize`/`route` per-request with comments on when to use overrides
  - [x] 7.9 Create `examples/node-sdk/examples/09-context-optimizer.ts` — two `client.complete()` calls with identical prompts (`optimize: true` vs `optimize: false`); log `tokensSaved` for each and print comparison; comment explaining the Pro feature
  - [x] 7.10 Create `examples/node-sdk/examples/10-budget-firewall.ts` — catch `GateCtrApiError` with `code === "budget_exceeded"`; read `.status` (429) and `.requestId`; graceful fallback pattern; comment explaining Budget Firewall
  - [x] 7.11 Create `examples/node-sdk/examples/11-model-router.ts` — client with `route: true`, `client.chat()`, log `gatectr.modelUsed`; per-request override with `gatectr: { route: false }`; comment explaining Model Router

- [-] 8. Verify typecheck passes
  - [x] 8.1 Run `pnpm typecheck` inside `examples/node-sdk/` and confirm zero TypeScript errors across all 11 example files
