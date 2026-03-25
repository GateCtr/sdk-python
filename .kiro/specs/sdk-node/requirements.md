# Requirements Document

## Introduction

The `@gatectr/sdk` is a production-grade Node.js SDK for the GateCtr platform. It provides a typed, ergonomic client for the GateCtr API (`/api/v1/`) that is a drop-in replacement for the OpenAI SDK — same message format, same response shape, plus GateCtr-specific metadata. The SDK is published as an independent npm package (`@gatectr/sdk`) living in `sdk-node/`, built with TypeScript 5 strict mode, dual ESM/CJS output, and the same DevOps toolchain as the main platform (pnpm, ESLint, Prettier, Husky, Conventional Commits, GitHub Actions CI + npm publish).

---

## Glossary

- **SDK**: The `@gatectr/sdk` npm package, the subject of this document.
- **Client**: The `GateCtr` class — the main entry point consumers instantiate.
- **Platform**: The GateCtr backend API at `https://api.gatectr.com/v1`.
- **API_Key**: A Bearer token prefixed with `gct_`, used to authenticate requests to the Platform.
- **GateCtr_Metadata**: Per-response metadata returned by the Platform in HTTP response headers (`X-GateCtr-Request-Id`, `X-GateCtr-Latency-Ms`, `X-GateCtr-Overage`) and surfaced on every SDK response object as a `gatectr` field.
- **Per_Request_Options**: Optional per-call overrides (`budgetId`, `optimize`, `route`) passed inside a `gatectr` field on the request body.
- **Stream_Chunk**: A single server-sent event chunk yielded during a streaming completion, containing a `delta` string and optional finish metadata.
- **Complete_Response**: The response shape returned by `client.complete()` and `client.chat()` — OpenAI-compatible plus a `gatectr` field.
- **Models_Response**: The array of model objects returned by `client.models()`.
- **Usage_Response**: The usage statistics object returned by `client.usage()`.
- **Retry_Policy**: The SDK-level automatic retry logic for transient HTTP errors (5xx, network timeouts).
- **Timeout**: The per-request wall-clock deadline in milliseconds after which the SDK aborts the request.
- **Dual_Package**: A package that ships both ESM (`dist/esm/`) and CJS (`dist/cjs/`) builds with a `package.json` `exports` map.
- **fast-check**: The property-based testing library used for generative test cases.
- **Vitest**: The unit test runner used for the SDK test suite.

---

## Requirements

### Requirement 1: Package Identity and Structure

**User Story:** As a developer, I want to install `@gatectr/sdk` from npm and import it in both ESM and CJS projects, so that I can use it regardless of my module system.

#### Acceptance Criteria

1. THE SDK SHALL be published under the npm package name `@gatectr/sdk`.
2. THE SDK SHALL declare `"engines": { "node": ">=18" }` in `package.json`.
3. THE SDK SHALL export a Dual_Package: an `exports` map in `package.json` SHALL expose `"import"` (ESM) and `"require"` (CJS) entry points built from TypeScript source.
4. THE SDK SHALL include a `types` field pointing to the generated `.d.ts` declaration file so TypeScript consumers get full type inference without additional configuration.
5. THE SDK SHALL include a `CHANGELOG.md` file at the package root, following the Keep a Changelog format.
6. THE SDK SHALL include a `LICENSE` file (MIT) at the package root.
7. THE SDK SHALL NOT include `dist/`, `node_modules/`, `.env`, or coverage artifacts in the published package; a `files` field in `package.json` SHALL restrict the published contents to `dist/` and `README.md`.

---

### Requirement 2: Client Instantiation and Configuration

**User Story:** As a developer, I want to instantiate a `GateCtr` client with my API key and optional config, so that I can make authenticated requests to the Platform.

#### Acceptance Criteria

1. THE Client SHALL accept a configuration object with the following fields:
   - `apiKey` (string, required): the API_Key used for Bearer authentication.
   - `baseUrl` (string, optional, default `"https://api.gatectr.com/v1"`): the Platform base URL.
   - `timeout` (number, optional, default `30000`): request Timeout in milliseconds.
   - `optimize` (boolean, optional, default `true`): global enable/disable for the Context Optimizer.
   - `route` (boolean, optional, default `false`): global enable/disable for the Model Router.
2. IF `apiKey` is not provided or is an empty string, THEN THE Client SHALL throw a `GateCtrConfigError` synchronously at construction time with a message indicating the missing key.
3. THE Client SHALL NOT log the `apiKey` value anywhere — not to `console`, not to error messages, not to stack traces.
4. THE Client SHALL read `apiKey` from the `GATECTR_API_KEY` environment variable as a fallback when the constructor `apiKey` option is not provided, before throwing `GateCtrConfigError`.
5. WHERE `baseUrl` is provided, THE Client SHALL use it as the base for all HTTP requests, stripping any trailing slash before appending path segments.

---

### Requirement 3: `complete()` — Text Completion

**User Story:** As a developer, I want to call `client.complete()` with a model and messages, so that I get a text completion response in OpenAI-compatible format with GateCtr metadata.

#### Acceptance Criteria

1. WHEN `client.complete(params)` is called, THE Client SHALL send a `POST` request to `{baseUrl}/complete` with a JSON body containing `model`, `messages`, and any optional fields (`max_tokens`, `temperature`, `stream: false`).
2. WHEN the Platform returns a 200 response, THE Client SHALL return a `CompleteResponse` object with:
   - `id` (string)
   - `object` (`"text_completion"`)
   - `model` (string)
   - `choices` (array of `{ text: string, finish_reason: string }`)
   - `usage` (`{ prompt_tokens: number, completion_tokens: number, total_tokens: number }`)
   - `gatectr` (`{ requestId: string, latencyMs: number, overage: boolean, modelUsed: string, tokensSaved: number }`)
3. THE Client SHALL populate `gatectr.requestId` from the `X-GateCtr-Request-Id` response header.
4. THE Client SHALL populate `gatectr.latencyMs` from the `X-GateCtr-Latency-Ms` response header, parsed as a number.
5. THE Client SHALL populate `gatectr.overage` as `true` when the `X-GateCtr-Overage` response header is present and equals `"true"`, and `false` otherwise.
6. THE Client SHALL populate `gatectr.modelUsed` from the `model` field in the response body.
7. THE Client SHALL populate `gatectr.tokensSaved` from the `usage.saved_tokens` field in the response body when present, defaulting to `0`.
8. WHEN Per_Request_Options are provided in `params.gatectr`, THE Client SHALL merge them into the request body as top-level fields (`budgetId`, `optimize`, `route`), with per-request values taking precedence over client-level defaults.

---

### Requirement 4: `chat()` — Chat Completion

**User Story:** As a developer, I want to call `client.chat()` with a model and messages array, so that I get a chat completion response compatible with the OpenAI chat format.

#### Acceptance Criteria

1. WHEN `client.chat(params)` is called, THE Client SHALL send a `POST` request to `{baseUrl}/chat` with a JSON body containing `model`, `messages`, and any optional fields.
2. WHEN the Platform returns a 200 response, THE Client SHALL return a `ChatResponse` object with:
   - `id` (string)
   - `object` (`"chat.completion"`)
   - `model` (string)
   - `choices` (array of `{ message: { role: string, content: string }, finish_reason: string }`)
   - `usage` (`{ prompt_tokens: number, completion_tokens: number, total_tokens: number }`)
   - `gatectr` (same shape as in Requirement 3)
3. THE Client SHALL apply the same GateCtr_Metadata extraction rules as defined in Requirement 3 (criteria 3–7).
4. THE Client SHALL apply Per_Request_Options merging as defined in Requirement 3 (criterion 8).

---

### Requirement 5: `stream()` — Streaming Completion

**User Story:** As a developer, I want to call `client.stream()` and iterate over chunks with `for await`, so that I can display streamed LLM output token by token.

#### Acceptance Criteria

1. WHEN `client.stream(params)` is called, THE Client SHALL send a `POST` request to `{baseUrl}/chat` with `stream: true` in the request body.
2. THE Client SHALL return an `AsyncIterable<StreamChunk>` that the caller can consume with `for await`.
3. WHEN the Platform streams server-sent events, THE Client SHALL parse each `data:` line as JSON and yield a `StreamChunk` with:
   - `delta` (string | null): the incremental text content from `choices[0].delta.content`.
   - `finishReason` (string | null): the `finish_reason` from the final chunk.
   - `id` (string): the completion ID from the chunk.
4. WHEN the stream ends with a `[DONE]` sentinel, THE Client SHALL close the async iterator cleanly without throwing.
5. IF the underlying HTTP connection is aborted or errors, THEN THE Client SHALL propagate a `GateCtrStreamError` to the caller via the async iterator's `throw` path.
6. THE Client SHALL support `AbortSignal` passed as `params.signal` to cancel an in-flight stream.

---

### Requirement 6: `models()` — List Available Models

**User Story:** As a developer, I want to call `client.models()` to get the list of models available on the Platform, so that I can display or validate model choices in my application.

#### Acceptance Criteria

1. WHEN `client.models()` is called, THE Client SHALL send a `GET` request to `{baseUrl}/models`.
2. WHEN the Platform returns a 200 response, THE Client SHALL return an array of `ModelInfo` objects, each with:
   - `modelId` (string)
   - `displayName` (string)
   - `provider` (string)
   - `contextWindow` (number)
   - `capabilities` (string[])
3. THE Client SHALL include the `X-GateCtr-Request-Id` header value in a top-level `requestId` field on the returned array (as a non-enumerable property or a wrapper object — implementation choice, but it MUST be accessible).

---

### Requirement 7: `usage()` — Fetch Usage Statistics

**User Story:** As a developer, I want to call `client.usage()` with optional date range and project filters, so that I can retrieve token consumption and cost data programmatically.

#### Acceptance Criteria

1. WHEN `client.usage(params?)` is called, THE Client SHALL send a `GET` request to `{baseUrl}/usage` with optional query parameters `from`, `to`, and `projectId` derived from `params`.
2. WHEN the Platform returns a 200 response, THE Client SHALL return a `UsageResponse` object with:
   - `totalTokens` (number)
   - `totalRequests` (number)
   - `totalCostUsd` (number)
   - `savedTokens` (number)
   - `from` (string)
   - `to` (string)
   - `byProject` (array of `{ projectId: string | null, totalTokens: number, totalRequests: number, totalCostUsd: number }`)
   - `budgetStatus` (object | undefined): present when the Platform includes it.
3. THE Client SHALL pass `from` and `to` as ISO date strings (`YYYY-MM-DD`) when provided.

---

### Requirement 8: Authentication

**User Story:** As a developer, I want every SDK request to be authenticated with my API key, so that the Platform can identify and authorize my calls.

#### Acceptance Criteria

1. THE Client SHALL attach an `Authorization: Bearer {apiKey}` header to every outgoing HTTP request.
2. THE Client SHALL attach a `Content-Type: application/json` header to every `POST` request.
3. THE Client SHALL attach a `User-Agent: @gatectr/sdk/{version} node/{process.version}` header to every request, where `{version}` is the SDK package version read from `package.json` at build time.
4. THE Client SHALL NOT expose the raw `apiKey` value in any thrown error message, log output, or serialized object.

---

### Requirement 9: Error Handling

**User Story:** As a developer, I want the SDK to throw typed, structured errors, so that I can handle API errors, network failures, and configuration mistakes with precise `catch` branches.

#### Acceptance Criteria

1. THE SDK SHALL export the following error classes, all extending a base `GateCtrError`:
   - `GateCtrConfigError` — thrown for invalid or missing configuration (e.g., no API key).
   - `GateCtrApiError` — thrown when the Platform returns a non-2xx HTTP response; MUST include `status` (HTTP status code), `code` (Platform error code string), and `requestId` (from `X-GateCtr-Request-Id` header when available).
   - `GateCtrTimeoutError` — thrown when a request exceeds the configured Timeout.
   - `GateCtrStreamError` — thrown when a streaming connection fails mid-stream.
   - `GateCtrNetworkError` — thrown for DNS failures, connection refused, and other transport-level errors.
2. WHEN the Platform returns HTTP 401, THE Client SHALL throw `GateCtrApiError` with `status: 401` and `code: "invalid_api_key"` (or the Platform-provided code).
3. WHEN the Platform returns HTTP 429, THE Client SHALL throw `GateCtrApiError` with `status: 429` and `code: "rate_limit_exceeded"` or `"budget_exceeded"` as returned by the Platform.
4. WHEN the Platform returns HTTP 5xx, THE Client SHALL apply the Retry_Policy before throwing `GateCtrApiError`.
5. IF a request times out, THEN THE Client SHALL throw `GateCtrTimeoutError` with the configured timeout value in the message.
6. THE `GateCtrApiError` SHALL include a `toJSON()` method that returns a plain object safe for logging — it MUST NOT include the API key.

---

### Requirement 10: Retry Policy

**User Story:** As a developer, I want the SDK to automatically retry transient failures, so that my application is resilient to brief Platform outages without me writing retry logic.

#### Acceptance Criteria

1. THE Client SHALL retry requests that fail with HTTP 429 (rate limit), 500, 502, 503, or 504 up to 3 times by default.
2. THE Client SHALL use exponential backoff with jitter between retries: base delay of 500ms, multiplied by `2^attempt`, plus a random jitter of 0–100ms.
3. THE Client SHALL NOT retry requests that fail with HTTP 400, 401, 403, or 404 — these are non-retryable client errors.
4. THE Client SHALL NOT retry streaming requests after the stream has started emitting chunks.
5. WHERE a `maxRetries` option is provided in the constructor config, THE Client SHALL use that value instead of the default of 3.
6. WHEN all retries are exhausted, THE Client SHALL throw the appropriate typed error from Requirement 9.

---

### Requirement 11: TypeScript Types and Exports

**User Story:** As a TypeScript developer, I want all SDK types to be exported from the package root, so that I can annotate my own code without importing from internal paths.

#### Acceptance Criteria

1. THE SDK SHALL export all public types and interfaces from the package root (`index.ts`), including: `GateCtrConfig`, `CompleteParams`, `ChatParams`, `StreamParams`, `StreamChunk`, `CompleteResponse`, `ChatResponse`, `ModelsResponse`, `UsageParams`, `UsageResponse`, `ModelInfo`, `GateCtrMetadata`, `GateCtrError`, `GateCtrApiError`, `GateCtrConfigError`, `GateCtrTimeoutError`, `GateCtrStreamError`, `GateCtrNetworkError`.
2. THE SDK SHALL be compiled with `strict: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true` in `tsconfig.json`.
3. THE SDK SHALL emit declaration files (`.d.ts`) alongside the compiled output so consumers get full IntelliSense.
4. THE SDK SHALL NOT use `any` in public-facing type signatures — `unknown` MUST be used where the type is genuinely unknown.

---

### Requirement 12: Build System

**User Story:** As a maintainer, I want a reproducible build that emits both ESM and CJS artifacts to `dist/`, so that the package can be published and consumed by any Node.js project.

#### Acceptance Criteria

1. THE SDK SHALL use `tsc` to compile TypeScript source to `dist/esm/` (ESM, `"module": "ESNext"`) and `dist/cjs/` (CJS, `"module": "CommonJS"`).
2. THE SDK SHALL include a `build` script in `package.json` that runs both compilations and writes a `dist/cjs/package.json` containing `{ "type": "commonjs" }` to ensure Node.js resolves CJS correctly.
3. THE SDK SHALL include a `clean` script that removes `dist/` and `*.tsbuildinfo` before a fresh build.
4. THE SDK SHALL include a `prepublishOnly` script that runs `clean`, `build`, and `test` in sequence, preventing a broken package from being published.
5. THE SDK SHALL use `pnpm` as the package manager; a `pnpm-lock.yaml` MUST be committed.

---

### Requirement 13: Testing

**User Story:** As a maintainer, I want a comprehensive test suite with unit tests and property-based tests, so that I can confidently refactor and release the SDK.

#### Acceptance Criteria

1. THE SDK SHALL use Vitest as the test runner with a `vitest.config.ts` that targets Node environment.
2. THE SDK SHALL use `msw` (Mock Service Worker) or `nock` to intercept HTTP requests in tests — no real network calls in the test suite.
3. THE SDK SHALL include unit tests covering: client construction (valid and invalid config), `complete()` happy path, `chat()` happy path, `stream()` happy path and error path, `models()`, `usage()`, all error classes, retry logic (verify retry count and backoff), and timeout behavior.
4. THE SDK SHALL include property-based tests using `fast-check` covering:
   - FOR ALL valid `GateCtrConfig` objects, constructing a `GateCtr` client SHALL succeed without throwing.
   - FOR ALL `CompleteResponse` objects round-tripped through JSON serialization and deserialization, the `gatectr` metadata fields SHALL be preserved exactly (round-trip property).
   - FOR ALL sequences of `StreamChunk` objects, concatenating all non-null `delta` values SHALL produce the same string regardless of chunk boundary positions (confluence property).
   - FOR ALL invalid `apiKey` values (empty string, null, undefined, non-string), constructing a `GateCtr` client SHALL throw `GateCtrConfigError` (error condition property).
5. THE SDK SHALL achieve a minimum of 80% line coverage, enforced via Vitest coverage thresholds in `vitest.config.ts`.
6. THE SDK SHALL include a `test` script (`vitest run`) and a `test:coverage` script (`vitest run --coverage`) in `package.json`.

---

### Requirement 14: Code Quality Toolchain

**User Story:** As a maintainer, I want the same linting, formatting, and commit conventions as the main platform, so that the SDK codebase is consistent and contributions are easy to review.

#### Acceptance Criteria

1. THE SDK SHALL include an ESLint configuration (`eslint.config.mjs`) using `@typescript-eslint/eslint-plugin` with strict TypeScript rules.
2. THE SDK SHALL include a Prettier configuration (`.prettierrc`) consistent with the main platform's formatting rules.
3. THE SDK SHALL include Husky with a `pre-commit` hook that runs `lint-staged` to lint and format staged files before every commit.
4. THE SDK SHALL include a `commitlint` configuration enforcing Conventional Commits (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `style`).
5. THE SDK SHALL include a `lint` script (`eslint src/`) and a `format` script (`prettier --write .`) in `package.json`.

---

### Requirement 15: CI/CD — GitHub Actions

**User Story:** As a maintainer, I want GitHub Actions workflows for CI and npm publish, so that every PR is validated and releases are automated.

#### Acceptance Criteria

1. THE SDK SHALL include a `.github/workflows/ci.yml` workflow that runs on every push and pull request to `main` and `develop`, executing: lint, type-check, test with coverage, and build.
2. THE SDK SHALL include a `.github/workflows/publish.yml` workflow that triggers on `push` to tags matching `v*.*.*`, runs the full CI suite, and publishes to npm using `NODE_AUTH_TOKEN` from GitHub secrets.
3. THE CI workflow SHALL use Node.js 18 and pnpm 10, matching the main platform's CI configuration.
4. THE publish workflow SHALL set `registry-url: https://registry.npmjs.org` and use `pnpm publish --access public --no-git-checks`.
5. THE SDK SHALL include a `.github/workflows/release.yml` workflow that creates a GitHub Release with auto-generated release notes when a version tag is pushed.

---

### Requirement 16: Security

**User Story:** As a security-conscious developer, I want the SDK to handle API keys safely, so that my credentials are never accidentally leaked.

#### Acceptance Criteria

1. THE SDK SHALL NOT hardcode any API keys, secrets, or credentials in source code.
2. THE SDK SHALL redact the `apiKey` value in all error messages, replacing it with `"[REDACTED]"` if it appears.
3. THE SDK SHALL support reading `apiKey` from the `GATECTR_API_KEY` environment variable as documented in Requirement 2.
4. THE SDK SHALL NOT make any outbound HTTP requests at module load time — all network activity MUST be deferred until a method is called on the Client.
5. THE SDK SHALL validate that `baseUrl` is a valid HTTP or HTTPS URL when provided; IF it is not, THEN THE Client SHALL throw `GateCtrConfigError` at construction time.

---

### Requirement 17: Git Repository and Branching Strategy

**User Story:** As a maintainer, I want the `sdk-node/` directory to be a standalone git repository with the same branching strategy as the main platform, so that it can be versioned and released independently with a consistent, safe workflow.

#### Acceptance Criteria

1. THE `sdk-node/` directory SHALL be initialized as a standalone git repository (`git init`) with its own commit history.
2. THE SDK repository SHALL have an initial commit on `main` containing all scaffolded files, following Conventional Commits format: `chore: initial sdk scaffold`.
3. THE SDK repository SHALL have a `.gitignore` that excludes `node_modules/`, `dist/`, `coverage/`, `.env`, and `*.tsbuildinfo`.
4. THE SDK repository SHALL have two permanent protected branches: `main` (production-stable) and `develop` (continuous integration). NEITHER branch SHALL ever be deleted.
5. ALL feature development SHALL follow this flow: create a `feat/<name>` branch from `develop` → commit → open a PR into `develop` → merge with merge commit → delete the feature branch.
6. ALL releases SHALL follow this flow: open a PR from `develop` into `main` → merge → tag the merge commit on `main` with a semver version tag (`v*.*.*`) → the tag triggers the npm publish and GitHub Release workflows.
7. NO direct pushes SHALL be made to `main` or `develop` — all changes MUST go through a Pull Request.
8. Branch naming conventions SHALL mirror the main platform:
   - `feat/<name>` — new features
   - `fix/<name>` — bug fixes
   - `hotfix/<name>` — urgent fixes branched from `main`
   - `chore/<name>` — maintenance and tooling
   - `docs/<name>` — documentation
   - `refactor/<name>` — refactoring
9. THE CI workflow SHALL run on push and pull_request events targeting both `main` and `develop`.
10. THE PR checks workflow SHALL validate PR titles against Conventional Commits format and check for merge conflicts, identical to the main platform's `pr-checks.yml`.
