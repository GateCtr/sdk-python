# Implementation Plan: @gatectr/sdk Node.js SDK

## Overview

Implement the `@gatectr/sdk` package as a standalone TypeScript project in `sdk-node/`. Tasks follow dependency order: repo scaffold → config files → source modules → tests → build verification → CI/CD → git finalization.

## Tasks

- [x] 1. Initialize standalone git repository and directory structure
  - Run `git init` inside `sdk-node/`
  - Create `.gitignore` excluding `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`, `.env`, `.env.*`, `!.env.example`
  - Create empty `sdk-node/src/` and `sdk-node/tests/` directories (via placeholder or first files)
  - Create `CHANGELOG.md` with Keep a Changelog header (`## [Unreleased]`)
  - Create `LICENSE` (MIT, year 2025, copyright GateCtr)
  - _Requirements: 1.5, 1.6, 17.1, 17.3_

- [-] 2. Create package configuration files
  - [x] 2.1 Create `package.json` with name `@gatectr/sdk`, version `0.1.0`, `"type": "module"`, `engines: { node: ">=18" }`, `exports` map (ESM + CJS), `files: ["dist/", "README.md"]`, and all scripts: `build`, `clean`, `lint`, `format`, `test`, `test:coverage`, `typecheck`, `prepublishOnly`
    - Include devDependencies: `typescript`, `vitest`, `@vitest/coverage-v8`, `fast-check`, `msw`, `eslint`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `prettier`, `husky`, `lint-staged`, `@commitlint/cli`, `@commitlint/config-conventional`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 12.2, 12.3, 12.4, 12.5, 13.1, 13.6, 14.5_

  - [ ] 2.2 Create `tsconfig.json` (base: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, declaration, declarationMap, sourceMap, moduleResolution bundler, target ES2022)
    - Create `tsconfig.esm.json` extending base with `module: ESNext`, `outDir: ./dist/esm`
    - Create `tsconfig.cjs.json` extending base with `module: CommonJS`, `moduleResolution: node`, `outDir: ./dist/cjs`
    - _Requirements: 11.2, 11.3, 12.1_

  - [x] 2.3 Create `vitest.config.ts` with `environment: "node"` and coverage thresholds of 80% for lines, functions, and branches using `provider: "v8"`
    - _Requirements: 13.1, 13.5_

  - [ ] 2.4 Create `eslint.config.mjs` using `@typescript-eslint/eslint-plugin` with strict TypeScript rules
    - Create `.prettierrc` with consistent formatting rules (2-space indent, single quotes, trailing commas)
    - Create `commitlint.config.mjs` extending `@commitlint/config-conventional`
    - _Requirements: 14.1, 14.2, 14.4_

  - [x] 2.5 Create `scripts/postbuild.mjs` that writes `{"type":"commonjs"}` to `dist/cjs/package.json`
    - _Requirements: 12.2_

- [x] 3. Implement `src/types.ts` — all public TypeScript interfaces
  - Define and export: `GateCtrConfig`, `PerRequestOptions`, `Message`, `GateCtrMetadata`, `UsageCounts`, `CompleteParams`, `CompleteResponse`, `ChatParams`, `ChatResponse`, `StreamParams`, `StreamChunk`, `ModelInfo`, `ModelsResponse`, `UsageParams`, `UsageByProject`, `UsageResponse`
  - Use `unknown` (never `any`) for genuinely unknown types
  - _Requirements: 2.1, 3.2, 4.2, 5.3, 6.2, 7.2, 11.1, 11.4_

- [x] 4. Implement `src/errors.ts` — error class hierarchy
  - [x] 4.1 Implement `GateCtrError` (base), `GateCtrConfigError`, `GateCtrTimeoutError` (with `timeoutMs` field), `GateCtrStreamError` (with `cause`), `GateCtrNetworkError` (with `cause`)
    - Implement `GateCtrApiError` with `status`, `code`, `requestId` fields and a `toJSON()` method returning `{ name, message, status, code, requestId }` — no API key in output
    - _Requirements: 9.1, 9.6_

  - [ ]* 4.2 Write unit tests in `tests/errors.test.ts`
    - Test `instanceof` checks across the hierarchy
    - Test `GateCtrApiError.toJSON()` output shape and absence of API key
    - Test `GateCtrTimeoutError` includes `timeoutMs` in message
    - _Requirements: 9.1, 9.6, 13.3_

- [x] 5. Implement `src/http.ts` — fetch wrapper with retry and timeout
  - [x] 5.1 Implement `httpRequest(opts: RequestOptions): Promise<RawResponse>` using native `fetch`
    - Implement timeout via `AbortController` + `setTimeout` cleared on success/error
    - Implement retry loop: retryable statuses `[429, 500, 502, 503, 504]`, non-retryable `[400, 401, 403, 404]`, default `maxRetries: 3`
    - Implement `backoffMs(attempt)`: `min(500 * 2^attempt + jitter(0-100), 10000)`
    - Throw `GateCtrTimeoutError` on abort, `GateCtrNetworkError` on fetch throw, `GateCtrApiError` on non-2xx after retries exhausted
    - _Requirements: 9.4, 9.5, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 5.2 Write property test: retryable status codes trigger exactly N+1 attempts
    - **Property 11: Retryable status codes trigger retry up to maxRetries**
    - **Validates: Requirements 10.1, 10.5**

  - [ ]* 5.3 Write property test: non-retryable status codes throw immediately
    - **Property 12: Non-retryable status codes throw immediately**
    - **Validates: Requirements 10.3**

  - [ ]* 5.4 Write property test: backoff delays are monotonically non-decreasing
    - **Property 13: Retry backoff delays are monotonically non-decreasing**
    - **Validates: Requirements 10.2**

  - [ ]* 5.5 Write unit tests in `tests/http.test.ts` using msw
    - Test retry count for each retryable status code
    - Test no retry for non-retryable codes (400, 401, 403, 404)
    - Test timeout throws `GateCtrTimeoutError`
    - Test `Authorization`, `User-Agent`, `Content-Type` headers are injected
    - _Requirements: 8.1, 8.2, 8.3, 9.4, 9.5, 10.1, 10.3, 13.3_

- [x] 6. Implement `src/stream.ts` — SSE parser
  - [x] 6.1 Implement `parseSSE(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<StreamChunk>`
    - Read body via `TextDecoder`, split on newlines, parse `data: {...}` lines
    - Yield `StreamChunk` with `delta` from `choices[0].delta.content`, `finishReason`, `id`
    - Stop cleanly on `data: [DONE]` sentinel without throwing
    - Propagate `GateCtrStreamError` on connection abort or parse error
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

  - [ ]* 6.2 Write property test: SSE chunks are correctly parsed
    - **Property 8: SSE stream chunks are correctly parsed**
    - **Validates: Requirements 5.3**

  - [ ]* 6.3 Write property test: stream chunk concatenation is order-preserving
    - **Property 9: Stream chunk concatenation is order-preserving**
    - **Validates: Requirements 5.3, 13.4c**

  - [ ]* 6.4 Write unit tests in `tests/stream.test.ts`
    - Test `[DONE]` sentinel closes iterator cleanly
    - Test mid-stream error propagates as `GateCtrStreamError`
    - Test `AbortSignal` cancellation
    - Test multi-line SSE payloads
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 13.3_

- [-] 7. Implement `src/client.ts` — GateCtr class
  - [x] 7.1 Implement constructor with config validation
    - Read `apiKey` from `GATECTR_API_KEY` env var as fallback before throwing `GateCtrConfigError`
    - Throw `GateCtrConfigError` synchronously if `apiKey` is missing, empty, or whitespace-only
    - Validate `baseUrl` is a valid HTTP/HTTPS URL; throw `GateCtrConfigError` if not
    - Strip trailing slash from `baseUrl`
    - Store `apiKey` in private field; never interpolate it into error messages
    - Apply defaults: `baseUrl: "https://api.gatectr.com/v1"`, `timeout: 30000`, `maxRetries: 3`, `optimize: true`, `route: false`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 16.1, 16.2, 16.4, 16.5_

  - [x] 7.2 Implement `complete(params: CompleteParams): Promise<CompleteResponse>`
    - POST to `{baseUrl}/complete` with `model`, `messages`, optional fields, `stream: false`
    - Merge `params.gatectr` per-request options into body (per-request overrides client defaults)
    - Extract `GateCtrMetadata` from response headers (`X-GateCtr-Request-Id`, `X-GateCtr-Latency-Ms`, `X-GateCtr-Overage`) and body (`model`, `usage.saved_tokens`)
    - Return typed `CompleteResponse`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 7.3 Implement `chat(params: ChatParams): Promise<ChatResponse>`
    - POST to `{baseUrl}/chat` with same metadata extraction and per-request options as `complete()`
    - Return typed `ChatResponse`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 7.4 Implement `stream(params: StreamParams): AsyncIterable<StreamChunk>`
    - POST to `{baseUrl}/chat` with `stream: true`
    - Pass response body to `parseSSE()`, forward `params.signal`
    - Do not retry after stream has started emitting chunks
    - _Requirements: 5.1, 5.2, 5.6, 10.4_

  - [x] 7.5 Implement `models(): Promise<ModelsResponse>` and `usage(params?: UsageParams): Promise<UsageResponse>`
    - GET `{baseUrl}/models` — return `ModelsResponse` with `models` array and `requestId`
    - GET `{baseUrl}/usage` with optional query params `from`, `to`, `projectId`
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3_

- [x] 8. Create `tests/handlers.ts` — reusable msw request handlers
  - Define `handlers` array with `http.post` for `/complete`, `/chat` (stream and non-stream), `http.get` for `/models` and `/usage`
  - Export `server = setupServer(...handlers)` for use across test files
  - Include mock response factories: `mockCompleteResponse()`, `mockChatResponse()`, `mockSSEResponse()`, `mockModelsResponse()`, `mockUsageResponse()`
  - _Requirements: 13.2_

- [-] 9. Write unit tests for `src/client.ts`
  - [x] 9.1 Create `tests/client.test.ts` with msw server setup/teardown
    - Test valid construction succeeds with all config combinations
    - Test `GATECTR_API_KEY` env var fallback
    - Test `complete()` happy path — correct request body, response shape, metadata extraction
    - Test `chat()` happy path — correct request body, response shape
    - Test `models()` and `usage()` happy paths
    - Test no network activity at module import time
    - _Requirements: 2.1, 2.4, 3.1, 3.2, 4.1, 4.2, 6.1, 7.1, 13.3, 16.4_

  - [ ]* 9.2 Write property test: valid config construction always succeeds
    - **Property 1: Valid config construction succeeds**
    - **Validates: Requirements 2.1, 13.4a**

  - [ ]* 9.3 Write property test: invalid apiKey always throws GateCtrConfigError
    - **Property 2: Invalid apiKey throws GateCtrConfigError**
    - **Validates: Requirements 2.2, 13.4d**

  - [ ]* 9.4 Write property test: apiKey never appears in error output
    - **Property 3: apiKey never appears in error output**
    - **Validates: Requirements 2.3, 8.4, 16.2**

  - [ ]* 9.5 Write property test: baseUrl trailing slash is always stripped
    - **Property 4: baseUrl trailing slash is always stripped**
    - **Validates: Requirements 2.5**

  - [ ]* 9.6 Write property test: all requests carry required authentication headers
    - **Property 5: All requests carry required authentication headers**
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [ ]* 9.7 Write property test: response metadata is correctly extracted
    - **Property 6: Response metadata is correctly extracted**
    - **Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7, 4.3**

  - [ ]* 9.8 Write property test: per-request options override client defaults
    - **Property 7: Per-request options override client defaults**
    - **Validates: Requirements 3.8, 4.4**

  - [ ]* 9.9 Write property test: invalid baseUrl throws GateCtrConfigError
    - **Property 15: Invalid baseUrl throws GateCtrConfigError**
    - **Validates: Requirements 16.5**

- [x] 10. Write remaining property-based tests in `tests/properties.test.ts`
  - [ ]* 10.1 Write property test: non-2xx responses throw GateCtrApiError with correct status
    - **Property 10: Non-2xx responses throw GateCtrApiError with correct status**
    - **Validates: Requirements 9.2, 9.3**

  - [ ]* 10.2 Write property test: CompleteResponse round-trips through JSON without data loss
    - **Property 14: CompleteResponse round-trips through JSON without data loss**
    - **Validates: Requirements 3.2, 13.4b**

- [x] 11. Create `src/index.ts` — barrel exports
  - Re-export `GateCtr` from `./client.js`
  - Re-export all error classes from `./errors.js`
  - Re-export all public types from `./types.js` using `export type`
  - _Requirements: 11.1_

- [x] 12. Checkpoint — verify build and tests pass
  - Run `pnpm install` to generate `pnpm-lock.yaml`
  - Run `pnpm typecheck` — zero TypeScript errors
  - Run `pnpm test:coverage` — all tests pass, ≥80% coverage on lines/functions/branches
  - Run `pnpm build` — `dist/esm/` and `dist/cjs/` are emitted, `dist/cjs/package.json` contains `{"type":"commonjs"}`
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Create GitHub Actions workflows
  - [x] 13.1 Create `.github/workflows/ci.yml` — runs on push/PR to `main` and `develop`; jobs: `lint` (eslint + prettier --check), `typecheck` (tsc --noEmit), `test` (vitest run --coverage, upload to codecov), `build` (pnpm build); uses Node.js 18 and pnpm 10
    - _Requirements: 15.1, 15.3, 17.9_

  - [x] 13.2 Create `.github/workflows/pr-checks.yml` — runs on pull_request (opened, synchronize, reopened); jobs: `pr-title` using `amannn/action-semantic-pull-request@v5`, `conflict-check` using `actions/github-script`
    - _Requirements: 17.10_

  - [x] 13.3 Create `.github/workflows/publish.yml` — triggers on `push` to tags `v*.*.*`; runs full CI then `pnpm publish --access public --no-git-checks`; uses `NODE_AUTH_TOKEN` secret and `registry-url: https://registry.npmjs.org`
    - _Requirements: 15.2, 15.4_

  - [x] 13.4 Create `.github/workflows/release.yml` — triggers on `push` to tags `v*.*.*`; uses `softprops/action-gh-release@v2` with `generate_release_notes: true`; sets `prerelease: true` when tag contains `alpha`, `beta`, or `rc`
    - _Requirements: 15.5_

- [x] 14. Configure Husky and lint-staged
  - Run `pnpm exec husky init` inside `sdk-node/`
  - Write `.husky/pre-commit` hook: `pnpm exec lint-staged`
  - Write `.husky/commit-msg` hook: `pnpm exec commitlint --edit "$1"`
  - Add `lint-staged` config to `package.json`: run `eslint --fix` and `prettier --write` on staged `src/**/*.ts` and `tests/**/*.ts` files
  - _Requirements: 14.3, 14.4_

- [x] 15. Final git commit sequence
  - Stage all files: `git add .`
  - Create initial commit on `main`: `git commit -m "chore: initial sdk scaffold"`
  - Create `develop` branch: `git checkout -b develop`
  - _Requirements: 17.1, 17.2, 17.4_

- [x] 16. Final checkpoint — verify complete scaffold
  - Confirm `sdk-node/` has two branches: `main` and `develop`
  - Confirm `dist/` is absent (not yet built in the repo, excluded by `.gitignore`)
  - Confirm `pnpm-lock.yaml` is committed
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- All property tests reference a numbered property from the design document
- The `tests/handlers.ts` file (task 8) must be created before any unit tests that use msw
- `src/index.ts` (task 11) should be created after all source modules are implemented so barrel exports compile cleanly
- Git operations in tasks 1 and 15 must be run inside `sdk-node/` — not the monorepo root
- The `pnpm-lock.yaml` is generated by `pnpm install` and must be committed (task 12)
