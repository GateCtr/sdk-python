# Requirements Document

## Introduction

`gatectr-sdk` is a production-grade Python SDK for the GateCtr platform. It provides a typed, async-first client for the GateCtr API (`/api/v1/`) that is a drop-in replacement for the OpenAI Python SDK — same message format, same response shape, plus GateCtr-specific metadata. The SDK is published as an independent PyPI package (`gatectr-sdk`) living in `sdk-python/`, built with Python 3.9+, Pydantic v2 models, `httpx` for async HTTP, and a full DevOps toolchain (ruff, mypy, pytest, hypothesis, GitHub Actions CI + PyPI publish).

---

## Glossary

- **SDK**: The `gatectr-sdk` PyPI package, the subject of this document.
- **Client**: The `GateCtr` class — the main async entry point consumers instantiate.
- **Platform**: The GateCtr backend API at `https://api.gatectr.com/v1`.
- **API_Key**: A Bearer token prefixed with `gct_`, used to authenticate requests to the Platform.
- **GateCtr_Metadata**: Per-response metadata returned by the Platform in HTTP response headers (`X-GateCtr-Request-Id`, `X-GateCtr-Latency-Ms`, `X-GateCtr-Overage`) and surfaced on every SDK response object as a `gatectr` field.
- **Per_Request_Options**: Optional per-call overrides (`budget_id`, `optimize`, `route`) passed inside a `gatectr` field on the request body.
- **Stream_Chunk**: A single server-sent event chunk yielded during a streaming completion, containing a `delta` string and optional finish metadata.
- **Complete_Response**: The response shape returned by `client.complete()` — OpenAI-compatible plus a `gatectr` field.
- **Chat_Response**: The response shape returned by `client.chat()` — OpenAI-compatible plus a `gatectr` field.
- **Models_Response**: The list of model objects returned by `client.models()`.
- **Usage_Response**: The usage statistics object returned by `client.usage()`.
- **Retry_Policy**: The SDK-level automatic retry logic for transient HTTP errors (5xx, network timeouts).
- **Timeout**: The per-request wall-clock deadline in seconds after which the SDK aborts the request.
- **Sync_Wrapper**: An optional synchronous facade over the async `GateCtr` client for developers not using `asyncio`.
- **httpx**: The async HTTP client library used by the SDK (`httpx.AsyncClient`).
- **Pydantic**: The data validation library (v2) used for all SDK response models.
- **hypothesis**: The property-based testing library used for generative test cases.
- **pytest**: The test runner used for the SDK test suite.
- **respx**: The `httpx`-compatible HTTP mocking library used in tests.
- **ruff**: The linter and formatter used for code quality.
- **mypy**: The static type checker used for type safety.
- **hatch**: The build backend and project manager used for packaging.

---

## Requirements

### Requirement 1: Package Identity and Structure

**User Story:** As a developer, I want to install `gatectr-sdk` from PyPI and import it in any Python 3.9+ project, so that I can use it regardless of my async framework.

#### Acceptance Criteria

1. THE SDK SHALL be published under the PyPI package name `gatectr-sdk`.
2. THE SDK SHALL declare `requires-python = ">=3.9"` in `pyproject.toml`.
3. THE SDK SHALL expose a top-level importable package named `gatectr` so consumers can write `from gatectr import GateCtr`.
4. THE SDK SHALL include a `CHANGELOG.md` file at the package root, following the Keep a Changelog format.
5. THE SDK SHALL include a `LICENSE` file (MIT) at the package root.
6. THE SDK SHALL NOT include `dist/`, `.venv/`, `__pycache__/`, `.env`, or coverage artifacts in the published package; the `[tool.hatch.build.targets.wheel]` section in `pyproject.toml` SHALL restrict published contents to the `gatectr/` source package.
7. THE SDK SHALL declare runtime dependencies limited to `httpx>=0.27` and `pydantic>=2.0` in `pyproject.toml`.

---

### Requirement 2: Client Instantiation and Configuration

**User Story:** As a developer, I want to instantiate a `GateCtr` client with my API key and optional config, so that I can make authenticated requests to the Platform.

#### Acceptance Criteria

1. THE Client SHALL accept the following constructor parameters:
   - `api_key` (str, optional): the API_Key used for Bearer authentication.
   - `base_url` (str, optional, default `"https://api.gatectr.com/v1"`): the Platform base URL.
   - `timeout` (float, optional, default `30.0`): request Timeout in seconds.
   - `max_retries` (int, optional, default `3`): maximum number of retry attempts.
   - `optimize` (bool, optional, default `True`): global enable/disable for the Context Optimizer.
   - `route` (bool, optional, default `False`): global enable/disable for the Model Router.
2. IF `api_key` is not provided and the `GATECTR_API_KEY` environment variable is not set, THEN THE Client SHALL raise `GateCtrConfigError` synchronously at construction time with a message indicating the missing key.
3. THE Client SHALL read `api_key` from the `GATECTR_API_KEY` environment variable as a fallback when the constructor `api_key` argument is not provided.
4. THE Client SHALL NOT log the `api_key` value anywhere — not to `logging`, not to error messages, not to tracebacks.
5. WHERE `base_url` is provided, THE Client SHALL strip any trailing slash before appending path segments.
6. IF `base_url` is provided and is not a valid HTTP or HTTPS URL, THEN THE Client SHALL raise `GateCtrConfigError` synchronously at construction time.

---

### Requirement 3: `complete()` — Text Completion

**User Story:** As a developer, I want to call `await client.complete()` with a model and messages, so that I get a text completion response in OpenAI-compatible format with GateCtr metadata.

#### Acceptance Criteria

1. WHEN `await client.complete(params)` is called, THE Client SHALL send a `POST` request to `{base_url}/complete` with a JSON body containing `model`, `messages`, and any optional fields (`max_tokens`, `temperature`, `stream: false`).
2. WHEN the Platform returns a 200 response, THE Client SHALL return a `CompleteResponse` Pydantic model with:
   - `id` (str)
   - `object` (Literal["text_completion"])
   - `model` (str)
   - `choices` (list of `CompleteChoice` with `text: str` and `finish_reason: str`)
   - `usage` (`UsageCounts` with `prompt_tokens: int`, `completion_tokens: int`, `total_tokens: int`)
   - `gatectr` (`GateCtrMetadata`)
3. THE Client SHALL populate `gatectr.request_id` from the `X-GateCtr-Request-Id` response header.
4. THE Client SHALL populate `gatectr.latency_ms` from the `X-GateCtr-Latency-Ms` response header, parsed as an integer.
5. THE Client SHALL populate `gatectr.overage` as `True` when the `X-GateCtr-Overage` response header is present and equals `"true"`, and `False` otherwise.
6. THE Client SHALL populate `gatectr.model_used` from the `model` field in the response body.
7. THE Client SHALL populate `gatectr.tokens_saved` from the `usage.saved_tokens` field in the response body when present, defaulting to `0`.
8. WHEN Per_Request_Options are provided in `params.gatectr`, THE Client SHALL merge them into the request body as top-level fields (`budget_id`, `optimize`, `route`), with per-request values taking precedence over client-level defaults.

---

### Requirement 4: `chat()` — Chat Completion

**User Story:** As a developer, I want to call `await client.chat()` with a model and messages list, so that I get a chat completion response compatible with the OpenAI chat format.

#### Acceptance Criteria

1. WHEN `await client.chat(params)` is called, THE Client SHALL send a `POST` request to `{base_url}/chat` with a JSON body containing `model`, `messages`, and any optional fields.
2. WHEN the Platform returns a 200 response, THE Client SHALL return a `ChatResponse` Pydantic model with:
   - `id` (str)
   - `object` (Literal["chat.completion"])
   - `model` (str)
   - `choices` (list of `ChatChoice` with `message: Message` and `finish_reason: str`)
   - `usage` (`UsageCounts`)
   - `gatectr` (`GateCtrMetadata`)
3. THE Client SHALL apply the same GateCtr_Metadata extraction rules as defined in Requirement 3 (criteria 3–7).
4. THE Client SHALL apply Per_Request_Options merging as defined in Requirement 3 (criterion 8).

---

### Requirement 5: `stream()` — Streaming Completion

**User Story:** As a developer, I want to call `client.stream()` and iterate over chunks with `async for`, so that I can display streamed LLM output token by token.

#### Acceptance Criteria

1. WHEN `client.stream(params)` is called, THE Client SHALL return an async context manager that, when entered, sends a `POST` request to `{base_url}/chat` with `stream: true` in the request body.
2. THE Client SHALL expose the stream as an `AsyncIterator[StreamChunk]` that the caller can consume with `async for`.
3. WHEN the Platform streams server-sent events, THE Client SHALL parse each `data:` line as JSON and yield a `StreamChunk` Pydantic model with:
   - `delta` (str | None): the incremental text content from `choices[0].delta.content`.
   - `finish_reason` (str | None): the `finish_reason` from the final chunk.
   - `id` (str): the completion ID from the chunk.
4. WHEN the stream ends with a `[DONE]` sentinel, THE Client SHALL close the async iterator cleanly without raising.
5. IF the underlying HTTP connection is aborted or errors mid-stream, THEN THE Client SHALL raise `GateCtrStreamError` to the caller.
6. THE Client SHALL support passing an `httpx.AsyncClient` cancellation mechanism via the context manager's `aclose()` method to cancel an in-flight stream.

---

### Requirement 6: `models()` — List Available Models

**User Story:** As a developer, I want to call `await client.models()` to get the list of models available on the Platform, so that I can display or validate model choices in my application.

#### Acceptance Criteria

1. WHEN `await client.models()` is called, THE Client SHALL send a `GET` request to `{base_url}/models`.
2. WHEN the Platform returns a 200 response, THE Client SHALL return a `ModelsResponse` Pydantic model containing:
   - `models` (list of `ModelInfo` with `model_id: str`, `display_name: str`, `provider: str`, `context_window: int`, `capabilities: list[str]`)
   - `request_id` (str): the value from the `X-GateCtr-Request-Id` response header.

---

### Requirement 7: `usage()` — Fetch Usage Statistics

**User Story:** As a developer, I want to call `await client.usage()` with optional date range and project filters, so that I can retrieve token consumption and cost data programmatically.

#### Acceptance Criteria

1. WHEN `await client.usage(params)` is called, THE Client SHALL send a `GET` request to `{base_url}/usage` with optional query parameters `from`, `to`, and `project_id` derived from `params`.
2. WHEN the Platform returns a 200 response, THE Client SHALL return a `UsageResponse` Pydantic model with:
   - `total_tokens` (int)
   - `total_requests` (int)
   - `total_cost_usd` (float)
   - `saved_tokens` (int)
   - `from_` (str, aliased from `"from"` in JSON)
   - `to` (str)
   - `by_project` (list of `UsageByProject` with `project_id: str | None`, `total_tokens: int`, `total_requests: int`, `total_cost_usd: float`)
   - `budget_status` (dict | None): present when the Platform includes it.
3. THE Client SHALL pass `from_` and `to` as ISO date strings (`YYYY-MM-DD`) when provided.

---

### Requirement 8: Authentication

**User Story:** As a developer, I want every SDK request to be authenticated with my API key, so that the Platform can identify and authorize my calls.

#### Acceptance Criteria

1. THE Client SHALL attach an `Authorization: Bearer {api_key}` header to every outgoing HTTP request.
2. THE Client SHALL attach a `Content-Type: application/json` header to every `POST` request.
3. THE Client SHALL attach a `User-Agent: gatectr-sdk/{version} python/{python_version}` header to every request, where `{version}` is the SDK package version read from package metadata at import time and `{python_version}` is `platform.python_version()`.
4. THE Client SHALL NOT expose the raw `api_key` value in any raised exception message, log output, or serialized object.

---

### Requirement 9: Error Handling

**User Story:** As a developer, I want the SDK to raise typed, structured exceptions, so that I can handle API errors, network failures, and configuration mistakes with precise `except` branches.

#### Acceptance Criteria

1. THE SDK SHALL export the following exception classes, all inheriting from a base `GateCtrError(Exception)`:
   - `GateCtrConfigError` — raised for invalid or missing configuration (e.g., no API key, invalid URL).
   - `GateCtrApiError` — raised when the Platform returns a non-2xx HTTP response; MUST include `status` (int HTTP status code), `code` (str Platform error code), and `request_id` (str | None from `X-GateCtr-Request-Id` header).
   - `GateCtrTimeoutError` — raised when a request exceeds the configured Timeout.
   - `GateCtrStreamError` — raised when a streaming connection fails mid-stream.
   - `GateCtrNetworkError` — raised for DNS failures, connection refused, and other transport-level errors.
2. WHEN the Platform returns HTTP 401, THE Client SHALL raise `GateCtrApiError` with `status=401` and `code="invalid_api_key"` (or the Platform-provided code).
3. WHEN the Platform returns HTTP 429, THE Client SHALL raise `GateCtrApiError` with `status=429` and `code="rate_limit_exceeded"` or `"budget_exceeded"` as returned by the Platform.
4. WHEN the Platform returns HTTP 5xx, THE Client SHALL apply the Retry_Policy before raising `GateCtrApiError`.
5. IF a request times out, THEN THE Client SHALL raise `GateCtrTimeoutError` with the configured timeout value in the message.
6. THE `GateCtrApiError` SHALL include a `to_dict()` method that returns a plain `dict` safe for logging — it MUST NOT include the API key.

---

### Requirement 10: Retry Policy

**User Story:** As a developer, I want the SDK to automatically retry transient failures, so that my application is resilient to brief Platform outages without me writing retry logic.

#### Acceptance Criteria

1. THE Client SHALL retry requests that fail with HTTP 429, 500, 502, 503, or 504 up to `max_retries` times (default 3).
2. THE Client SHALL use exponential backoff with jitter between retries: base delay of 0.5 seconds, multiplied by `2 ** attempt`, plus a random jitter of 0–0.1 seconds.
3. THE Client SHALL NOT retry requests that fail with HTTP 400, 401, 403, or 404 — these are non-retryable client errors.
4. THE Client SHALL NOT retry streaming requests after the stream has started emitting chunks.
5. WHERE `max_retries=0` is provided in the constructor, THE Client SHALL make exactly one attempt and raise immediately on failure.
6. WHEN all retries are exhausted, THE Client SHALL raise the appropriate typed exception from Requirement 9.

---

### Requirement 11: Python Types and Exports

**User Story:** As a Python developer using type checkers, I want all SDK types to be exported from the package root, so that I can annotate my own code without importing from internal modules.

#### Acceptance Criteria

1. THE SDK SHALL export all public types and classes from the `gatectr` package `__init__.py`, including: `GateCtr`, `GateCtrConfig`, `CompleteParams`, `ChatParams`, `StreamParams`, `StreamChunk`, `CompleteResponse`, `ChatResponse`, `ModelsResponse`, `UsageParams`, `UsageResponse`, `ModelInfo`, `GateCtrMetadata`, `GateCtrError`, `GateCtrApiError`, `GateCtrConfigError`, `GateCtrTimeoutError`, `GateCtrStreamError`, `GateCtrNetworkError`.
2. THE SDK SHALL include a `py.typed` marker file (PEP 561) so type checkers recognize the package as typed.
3. THE SDK SHALL pass `mypy --strict` with zero errors on the `gatectr/` source package.
4. THE SDK SHALL NOT use `Any` in public-facing type signatures — `object` or specific union types MUST be used where the type is genuinely unknown.
5. WHERE `SyncGateCtr` is implemented as a Sync_Wrapper, THE SDK SHALL export it from the package root alongside `GateCtr`.

---

### Requirement 12: Build System

**User Story:** As a maintainer, I want a reproducible build using PEP 517/518 standards, so that the package can be published to PyPI and installed by any Python project.

#### Acceptance Criteria

1. THE SDK SHALL use `pyproject.toml` as the single source of project metadata, following PEP 517/518.
2. THE SDK SHALL use `hatch` as the build backend (`[build-system] requires = ["hatchling"]`).
3. THE SDK SHALL include a `build` script in `pyproject.toml` (via `[tool.hatch.envs.default.scripts]`) that produces a source distribution (`sdist`) and wheel (`bdist_wheel`) in `dist/`.
4. THE SDK SHALL include a `clean` script that removes `dist/`, `*.egg-info`, `__pycache__`, and `.mypy_cache` before a fresh build.
5. THE SDK SHALL pin all development dependencies in a `requirements-dev.txt` or via `[tool.hatch.envs.dev.dependencies]` for reproducible CI environments.

---

### Requirement 13: Testing

**User Story:** As a maintainer, I want a comprehensive test suite with unit tests and property-based tests, so that I can confidently refactor and release the SDK.

#### Acceptance Criteria

1. THE SDK SHALL use `pytest` as the test runner with `pytest-asyncio` for async test support, configured with `asyncio_mode = "auto"` in `pyproject.toml`.
2. THE SDK SHALL use `respx` to mock `httpx` requests in tests — no real network calls in the test suite.
3. THE SDK SHALL include unit tests covering: client construction (valid and invalid config), `complete()` happy path, `chat()` happy path, `stream()` happy path and error path, `models()`, `usage()`, all exception classes, retry logic (verify retry count and backoff), timeout behavior, and env var fallback.
4. THE SDK SHALL include property-based tests using `hypothesis` covering:
   - FOR ALL valid `GateCtrConfig`-equivalent kwargs with a non-empty `api_key`, constructing a `GateCtr` client SHALL succeed without raising.
   - FOR ALL `CompleteResponse` objects round-tripped through `model.model_dump_json()` and `CompleteResponse.model_validate_json()`, the `gatectr` metadata fields SHALL be preserved exactly (round-trip property).
   - FOR ALL sequences of `StreamChunk` objects, concatenating all non-None `delta` values SHALL produce the same string regardless of chunk boundary positions (confluence property).
   - FOR ALL invalid `api_key` values (empty string, whitespace-only string), constructing a `GateCtr` client SHALL raise `GateCtrConfigError` (error condition property).
5. THE SDK SHALL achieve a minimum of 80% line coverage, enforced via `pytest-cov` with `--cov-fail-under=80` in the test configuration.
6. THE SDK SHALL include a `test` script (`pytest`) and a `test:coverage` script (`pytest --cov=gatectr --cov-fail-under=80`) in `pyproject.toml`.

---

### Requirement 14: Code Quality Toolchain

**User Story:** As a maintainer, I want linting, formatting, and type checking integrated into the development workflow, so that the SDK codebase is consistent and contributions are easy to review.

#### Acceptance Criteria

1. THE SDK SHALL use `ruff` for both linting and formatting, configured in `pyproject.toml` under `[tool.ruff]`, with rules equivalent to `flake8`, `isort`, and `pyupgrade`.
2. THE SDK SHALL use `mypy` for static type checking, configured in `pyproject.toml` under `[tool.mypy]` with `strict = true`.
3. THE SDK SHALL include a `pre-commit` configuration (`.pre-commit-config.yaml`) with hooks for `ruff --fix`, `ruff format`, and `mypy`.
4. THE SDK SHALL include a `lint` script (`ruff check gatectr/ tests/`) and a `format` script (`ruff format gatectr/ tests/`) in `pyproject.toml`.
5. THE SDK SHALL include a `typecheck` script (`mypy gatectr/`) in `pyproject.toml`.
6. THE SDK SHALL enforce Conventional Commits for all commit messages, validated via a `commitlint` or `gitlint` configuration.

---

### Requirement 15: CI/CD — GitHub Actions

**User Story:** As a maintainer, I want GitHub Actions workflows for CI and PyPI publish, so that every PR is validated and releases are automated.

#### Acceptance Criteria

1. THE SDK SHALL include a `.github/workflows/ci.yml` workflow that runs on every push and pull request to `main` and `develop`, executing: lint (`ruff check`), format check (`ruff format --check`), type-check (`mypy`), test with coverage (`pytest --cov`), and build (`hatch build`).
2. THE SDK SHALL include a `.github/workflows/publish.yml` workflow that triggers on `push` to tags matching `v*.*.*`, runs the full CI suite, and publishes to PyPI using `PYPI_API_TOKEN` from GitHub secrets via `hatch publish` or `twine upload`.
3. THE CI workflow SHALL use Python 3.11 (minimum) and test against Python 3.9, 3.10, 3.11, and 3.12 via a matrix strategy.
4. THE publish workflow SHALL use the PyPI Trusted Publisher mechanism (OIDC) when available, falling back to `PYPI_API_TOKEN`.
5. THE SDK SHALL include a `.github/workflows/release.yml` workflow that creates a GitHub Release with auto-generated release notes when a version tag is pushed.

---

### Requirement 16: Security

**User Story:** As a security-conscious developer, I want the SDK to handle API keys safely, so that my credentials are never accidentally leaked.

#### Acceptance Criteria

1. THE SDK SHALL NOT hardcode any API keys, secrets, or credentials in source code.
2. THE SDK SHALL redact the `api_key` value in all exception messages, replacing it with `"[REDACTED]"` if it appears.
3. THE SDK SHALL support reading `api_key` from the `GATECTR_API_KEY` environment variable as documented in Requirement 2.
4. THE SDK SHALL NOT make any outbound HTTP requests at module import time — all network activity MUST be deferred until a method is called on the Client.
5. THE SDK SHALL validate that `base_url` is a valid HTTP or HTTPS URL when provided; IF it is not, THEN THE Client SHALL raise `GateCtrConfigError` at construction time.
6. THE SDK SHALL NOT store the `api_key` in any attribute accessible via `__dict__` serialization or `repr()` output.

---

### Requirement 17: Sync Wrapper (Optional Feature)

**User Story:** As a developer who does not use `asyncio`, I want a synchronous `SyncGateCtr` client with the same methods as `GateCtr`, so that I can use the SDK in synchronous scripts and frameworks without managing an event loop.

#### Acceptance Criteria

1. WHERE the Sync_Wrapper is implemented, THE SDK SHALL provide a `SyncGateCtr` class that wraps `GateCtr` and exposes synchronous versions of all methods: `complete()`, `chat()`, `stream()`, `models()`, and `usage()`.
2. WHERE the Sync_Wrapper is implemented, THE `SyncGateCtr` class SHALL accept the same constructor parameters as `GateCtr`.
3. WHERE the Sync_Wrapper is implemented, THE `SyncGateCtr.stream()` method SHALL return a synchronous `Iterator[StreamChunk]` using a context manager.
4. WHERE the Sync_Wrapper is implemented, THE `SyncGateCtr` class SHALL manage its own internal event loop using `asyncio.run()` or an equivalent pattern, without requiring the caller to manage the loop.
5. WHERE the Sync_Wrapper is implemented, THE `SyncGateCtr` class SHALL raise the same typed exceptions as `GateCtr` for all error conditions.

---

### Requirement 18: Git Repository and Branching Strategy

**User Story:** As a maintainer, I want the `sdk-python/` directory to be a standalone git repository with the same branching strategy as the main platform, so that it can be versioned and released independently with a consistent, safe workflow.

#### Acceptance Criteria

1. THE `sdk-python/` directory SHALL be initialized as a standalone git repository (`git init`) with its own commit history.
2. THE SDK repository SHALL have an initial commit on `main` containing all scaffolded files, following Conventional Commits format: `chore: initial sdk scaffold`.
3. THE SDK repository SHALL have a `.gitignore` that excludes `__pycache__/`, `*.pyc`, `*.pyo`, `dist/`, `*.egg-info/`, `.venv/`, `coverage/`, `.coverage`, `.mypy_cache/`, `.ruff_cache/`, and `.env`.
4. THE SDK repository SHALL have two permanent protected branches: `main` (production-stable) and `develop` (continuous integration). NEITHER branch SHALL ever be deleted.
5. ALL feature development SHALL follow this flow: create a `feat/<name>` branch from `develop` → commit → open a PR into `develop` → merge with merge commit → delete the feature branch.
6. ALL releases SHALL follow this flow: open a PR from `develop` into `main` → merge → tag the merge commit on `main` with a semver version tag (`v*.*.*`) → the tag triggers the PyPI publish and GitHub Release workflows.
7. NO direct pushes SHALL be made to `main` or `develop` — all changes MUST go through a Pull Request.
8. Branch naming conventions SHALL mirror the main platform: `feat/<name>`, `fix/<name>`, `hotfix/<name>`, `chore/<name>`, `docs/<name>`, `refactor/<name>`.
9. THE CI workflow SHALL run on push and pull_request events targeting both `main` and `develop`.
10. THE PR checks workflow SHALL validate PR titles against Conventional Commits format and check for merge conflicts, identical in structure to the main platform's `pr-checks.yml`.
