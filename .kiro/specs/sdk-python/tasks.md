# Implementation Plan: gatectr-sdk Python SDK

## Overview

Implement the `gatectr-sdk` package as a standalone Python project in `sdk-python/`. Tasks follow dependency order: repo scaffold → config files → source modules → tests → CI/CD → git finalization.

## Tasks

- [x] 1. Initialize standalone git repository and directory structure
  - Run `git init` inside `sdk-python/`
  - Create `sdk-python/gatectr/` and `sdk-python/tests/` directories (via first files)
  - Create `CHANGELOG.md` with Keep a Changelog header (`## [Unreleased]`)
  - Create `LICENSE` (MIT, year 2025, copyright GateCtr)
  - Create `.gitignore` excluding `__pycache__/`, `*.pyc`, `*.pyo`, `*.pyd`, `dist/`, `*.egg-info/`, `.venv/`, `venv/`, `coverage/`, `.coverage`, `.mypy_cache/`, `.ruff_cache/`, `.env`, `.env.*`, `!.env.example`
  - Create `README.md` with installation and quickstart sections
  - _Requirements: 1.4, 1.5, 1.6, 18.1, 18.3_

- [x] 2. Create `pyproject.toml` and toolchain config files
  - [x] 2.1 Create `pyproject.toml` with `[build-system]` using `hatchling`, `[project]` metadata (`name = "gatectr-sdk"`, `version = "0.1.0"`, `requires-python = ">=3.9"`, `dependencies = ["httpx>=0.27", "pydantic>=2.0"]`), `[tool.hatch.envs.default]` dev dependencies (`pytest>=8.0`, `pytest-asyncio>=0.23`, `pytest-cov>=5.0`, `respx>=0.21`, `hypothesis>=6.100`, `mypy>=1.10`, `ruff>=0.4`), and all scripts: `test`, `test-cov`, `lint`, `format`, `typecheck`, `build`, `clean`
    - Configure `[tool.pytest.ini_options]` with `asyncio_mode = "auto"` and `testpaths = ["tests"]`
    - Configure `[tool.mypy]` with `strict = true` and `python_version = "3.9"`
    - Configure `[tool.ruff]` with `target-version = "py39"`, `line-length = 100`, and lint rules: `E`, `W`, `F`, `I`, `UP`, `B`, `C4`, `SIM`
    - Configure `[tool.coverage.run]` with `source = ["gatectr"]`
    - _Requirements: 1.1, 1.2, 1.7, 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.6, 14.1, 14.2, 14.4, 14.5_

  - [x] 2.2 Create `.pre-commit-config.yaml` with hooks for `ruff --fix`, `ruff format`, and `mypy`
    - _Requirements: 14.3_

- [x] 3. Implement `gatectr/errors.py` — exception hierarchy
  - [x] 3.1 Implement `GateCtrError(Exception)` base class
    - Implement `GateCtrConfigError(GateCtrError)` — raised synchronously at construction for invalid config
    - Implement `GateCtrApiError(GateCtrError)` with `status: int`, `code: str`, `request_id: str | None` fields and a `to_dict()` method returning `{"name", "message", "status", "code", "request_id"}` — never includes `api_key`
    - Implement `GateCtrTimeoutError(GateCtrError)` with `timeout_s: float` field; message format: `"Request timed out after {timeout_s}s"`
    - Implement `GateCtrStreamError(GateCtrError)` with `__cause__` chaining
    - Implement `GateCtrNetworkError(GateCtrError)` with `__cause__` chaining
    - _Requirements: 9.1, 9.6_

  - [x] 3.2 Create `gatectr/py.typed` PEP 561 marker file (empty file)
    - _Requirements: 11.2_

- [x] 4. Implement `gatectr/types.py` — Pydantic v2 models
  - [x] 4.1 Implement all shared and response models:
    - `Message(BaseModel)` with `role: Literal["system", "user", "assistant"]` and `content: str`
    - `GateCtrMetadata(BaseModel)` with `request_id`, `latency_ms`, `overage`, `model_used`, `tokens_saved` (default 0)
    - `UsageCounts(BaseModel)` with `prompt_tokens`, `completion_tokens`, `total_tokens`
    - `CompleteChoice(BaseModel)` with `text: str` and `finish_reason: str`
    - `CompleteResponse(BaseModel)` with `id`, `object: Literal["text_completion"]`, `model`, `choices`, `usage`, `gatectr`
    - `ChatChoice(BaseModel)` with `message: Message` and `finish_reason: str`
    - `ChatResponse(BaseModel)` with `id`, `object: Literal["chat.completion"]`, `model`, `choices`, `usage`, `gatectr`
    - `StreamChunk(BaseModel)` with `id: str`, `delta: str | None`, `finish_reason: str | None`
    - `ModelInfo(BaseModel)` with `model_id`, `display_name`, `provider`, `context_window`, `capabilities`
    - `ModelsResponse(BaseModel)` with `models: list[ModelInfo]` and `request_id: str`
    - `UsageParams(BaseModel)` with `from_: str | None = Field(None, alias="from")`, `to`, `project_id` and `model_config = {"populate_by_name": True}`
    - `UsageByProject(BaseModel)` with `project_id`, `total_tokens`, `total_requests`, `total_cost_usd`
    - `UsageResponse(BaseModel)` with all usage fields including `from_` aliased from `"from"` and `by_project: list[UsageByProject]`
    - `GateCtrConfig` dataclass with `api_key`, `base_url`, `timeout`, `max_retries`, `optimize`, `route`
    - `PerRequestOptions(BaseModel)` with `budget_id`, `optimize`, `route` (all optional)
    - _Requirements: 2.1, 3.2, 4.2, 5.3, 6.2, 7.2, 11.1, 11.4_

- [x] 5. Implement `gatectr/http.py` — httpx wrapper with retry and timeout
  - [x] 5.1 Implement `backoff_seconds(attempt: int) -> float`
    - Formula: `min(0.5 * 2**attempt + random.uniform(0.0, 0.1), 10.0)`
    - Define `RETRYABLE_STATUSES = frozenset({429, 500, 502, 503, 504})`
    - Define `NON_RETRYABLE_STATUSES = frozenset({400, 401, 403, 404})`
    - _Requirements: 10.2_

  - [x] 5.2 Implement `async def http_request(client, *, method, url, headers, json, params, max_retries, stream) -> httpx.Response`
    - Retry loop for retryable statuses up to `max_retries` times with `asyncio.sleep(backoff_seconds(attempt))`
    - For `stream=True`: open connection, check status, return immediately without retrying after headers received
    - Catch `httpx.TimeoutException` → raise `GateCtrTimeoutError`
    - Catch `httpx.NetworkError` → retry if attempts remain, else raise `GateCtrNetworkError`
    - _Requirements: 9.4, 9.5, 10.1, 10.3, 10.4, 10.5, 10.6_

  - [x] 5.3 Implement `_raise_for_status(response: httpx.Response) -> None`
    - Parse JSON body for `code` and `message` fields
    - Extract `X-GateCtr-Request-Id` from response headers
    - Raise `GateCtrApiError(message, status=..., code=..., request_id=...)`
    - _Requirements: 9.2, 9.3_

- [x] 6. Implement `gatectr/stream.py` — SSE parser
  - [x] 6.1 Implement `async def parse_sse(response: httpx.Response) -> AsyncIterator[StreamChunk]`
    - Iterate `response.aiter_lines()`, skip blank lines and non-`data:` lines
    - Stop cleanly on `data: [DONE]` sentinel without raising
    - Parse each `data:` payload as JSON, yield `StreamChunk` with `id`, `delta` from `choices[0].delta.content`, `finish_reason`
    - Raise `GateCtrStreamError` on `json.JSONDecodeError` or any other mid-stream exception
    - Call `await response.aclose()` in `finally` block
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

- [x] 7. Implement `gatectr/client.py` — GateCtr class
  - [x] 7.1 Implement `GateCtr` constructor with `__slots__` and config validation
    - Declare `__slots__ = ("_api_key", "_base_url", "_timeout", "_max_retries", "_optimize", "_route", "_http")`
    - Read `api_key` from `GATECTR_API_KEY` env var as fallback; raise `GateCtrConfigError` if still empty/whitespace
    - Validate `base_url` matches `^https?://`; raise `GateCtrConfigError` if not
    - Strip trailing slash from `base_url`
    - Store `api_key` via `object.__setattr__` to keep it out of `__dict__`
    - Create `httpx.AsyncClient(timeout=httpx.Timeout(timeout), headers=self._base_headers())`
    - Implement `__repr__` returning `api_key='[REDACTED]'`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 16.1, 16.2, 16.4, 16.5, 16.6_

  - [x] 7.2 Implement `_base_headers()`, `_merge_gatectr_opts()`, and `_extract_metadata()`
    - `_base_headers()`: returns `{"Authorization": "Bearer {api_key}", "User-Agent": "gatectr-sdk/{version} python/{python_version}"}`
    - `_merge_gatectr_opts(per_request)`: merges client-level `optimize`/`route` with per-request overrides
    - `_extract_metadata(response, body)`: extracts `GateCtrMetadata` from response headers and body
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 8.1, 8.2, 8.3_

  - [x] 7.3 Implement `async def complete(model, messages, *, max_tokens, temperature, gatectr) -> CompleteResponse`
    - POST to `{base_url}/complete` with merged body including `stream: False`
    - Inject `Content-Type: application/json` header
    - Call `_extract_metadata()` and inject into response dict before `CompleteResponse.model_validate()`
    - _Requirements: 3.1, 3.2, 3.8_

  - [x] 7.4 Implement `async def chat(model, messages, *, max_tokens, temperature, gatectr) -> ChatResponse`
    - POST to `{base_url}/chat` with same pattern as `complete()`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 7.5 Implement `async def stream(model, messages, *, max_tokens, temperature, gatectr) -> AsyncIterator[StreamChunk]`
    - POST to `{base_url}/chat` with `stream: True`
    - Pass response to `parse_sse()` and return the async iterator
    - Do not retry after stream has started
    - _Requirements: 5.1, 5.2, 5.6, 10.4_

  - [x] 7.6 Implement `async def models() -> ModelsResponse` and `async def usage(params) -> UsageResponse`
    - `models()`: GET `{base_url}/models`, inject `request_id` from `X-GateCtr-Request-Id` header
    - `usage()`: GET `{base_url}/usage` with optional query params `from`, `to`, `project_id`
    - _Requirements: 6.1, 6.2, 7.1, 7.2, 7.3_

  - [x] 7.7 Implement `aclose()`, `__aenter__`, and `__aexit__` for async context manager support
    - _Requirements: 5.6_

- [x] 8. Implement `SyncGateCtr` wrapper in `gatectr/client.py`
  - [x] 8.1 Implement `SyncGateCtr` class wrapping `GateCtr` with `asyncio.run()` per call
    - Constructor accepts same parameters as `GateCtr` and stores `self._async = GateCtr(...)`
    - Implement `__repr__` delegating to `self._async` with class name substitution
    - Implement synchronous `complete()`, `chat()`, `models()`, `usage()` via `asyncio.run(self._async.<method>(...))`
    - Implement synchronous `stream()` returning `Iterator[StreamChunk]` by collecting all chunks via `asyncio.run()`
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 9. Create `gatectr/__init__.py` — barrel exports
  - Re-export `GateCtr`, `SyncGateCtr` from `.client`
  - Re-export all 5 error classes from `.errors`
  - Re-export all public types from `.types`: `GateCtrMetadata`, `Message`, `PerRequestOptions`, `CompleteResponse`, `ChatResponse`, `StreamChunk`, `ModelInfo`, `ModelsResponse`, `UsageParams`, `UsageResponse`, `UsageCounts`, `UsageByProject`, `GateCtrConfig`
  - Define `__all__` listing all exported symbols
  - _Requirements: 11.1, 11.5_

- [x] 10. Create `tests/conftest.py` — pytest fixtures and mock helpers
  - Implement `mock_complete_body()`, `mock_chat_body()`, `mock_models_body()`, `mock_usage_body()` helper functions returning valid response dicts
  - Implement `mock_api` fixture using `respx.mock` that registers handlers for `/complete`, `/chat`, `/models`, `/usage` with appropriate mock responses and GateCtr headers
  - Implement `client` fixture that yields a `GateCtr("test-api-key")` instance
  - _Requirements: 13.2_

- [x] 11. Write unit tests — `tests/test_client.py`
  - [x] 11.1 Test `GateCtr` construction: valid config succeeds, missing `api_key` raises `GateCtrConfigError`, whitespace `api_key` raises `GateCtrConfigError`, invalid `base_url` raises `GateCtrConfigError`, `GATECTR_API_KEY` env var fallback works, trailing slash stripped from `base_url`
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 13.3_

  - [x] 11.2 Test `complete()` happy path: correct POST body, `CompleteResponse` shape, `gatectr` metadata fields populated from headers
    - Test `chat()` happy path: correct POST body, `ChatResponse` shape
    - Test `models()` happy path: `ModelsResponse` shape, `request_id` from header
    - Test `usage()` happy path: `UsageResponse` shape, query params forwarded
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 6.1, 6.2, 7.1, 7.2, 13.3_

  - [x] 11.3 Test no network activity at module import time
    - Test `SyncGateCtr` delegates correctly to `GateCtr` for `complete()` and `models()`
    - _Requirements: 16.4, 17.1_

- [x] 12. Write unit tests — `tests/test_http.py`
  - [x] 12.1 Test retry count: retryable status codes (429, 500, 502, 503, 504) trigger exactly `max_retries + 1` total attempts
    - Test non-retryable codes (400, 401, 403, 404) raise `GateCtrApiError` on first attempt with no retries
    - _Requirements: 10.1, 10.3, 13.3_

  - [x] 12.2 Test `max_retries=0` makes exactly one attempt and raises immediately
    - Test timeout raises `GateCtrTimeoutError` with configured timeout value
    - Test network error raises `GateCtrNetworkError`
    - _Requirements: 10.5, 9.4, 9.5, 13.3_

  - [x] 12.3 Test `Authorization`, `User-Agent`, and `Content-Type` headers are injected on every request
    - _Requirements: 8.1, 8.2, 8.3, 13.3_

- [x] 13. Write unit tests — `tests/test_stream.py`
  - [x] 13.1 Test SSE parsing: valid `data:` lines yield correct `StreamChunk` objects with `delta`, `finish_reason`, `id`
    - Test `[DONE]` sentinel closes the iterator cleanly without raising
    - _Requirements: 5.3, 5.4, 13.3_

  - [x] 13.2 Test mid-stream JSON parse error raises `GateCtrStreamError`
    - Test `response.aclose()` is called in all exit paths (success, error, cancellation)
    - _Requirements: 5.5, 13.3_

- [x] 14. Write unit tests — `tests/test_errors.py`
  - [x] 14.1 Test exception hierarchy: all 5 error classes are `isinstance` of `GateCtrError`
    - Test `GateCtrApiError.to_dict()` returns exactly `{"name", "message", "status", "code", "request_id"}` with no `api_key`
    - Test `GateCtrTimeoutError` message includes the configured timeout value
    - _Requirements: 9.1, 9.6, 13.3_

- [x] 15. Checkpoint — verify unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Write property-based tests — `tests/test_properties.py`
  - [x] 16.1 Write property test for Property 1: valid configuration construction succeeds
    - Use `valid_api_key`, `valid_base_url`, positive `timeout`, non-negative `max_retries`, boolean flags
    - **Property 1: Valid configuration construction succeeds**
    - **Validates: Requirements 2.1, 13.4a**

  - [x] 16.2 Write property test for Property 2: invalid api_key raises GateCtrConfigError
    - Use `invalid_api_key` strategy (empty string, whitespace-only); unset `GATECTR_API_KEY` env var
    - **Property 2: Invalid api_key raises GateCtrConfigError**
    - **Validates: Requirements 2.2, 13.4d**

  - [x] 16.3 Write property test for Property 3: api_key never appears in any output
    - Check `repr(client)`, exception messages, `to_dict()` output, and `vars(client)`
    - **Property 3: api_key never appears in any output**
    - **Validates: Requirements 8.4, 16.2, 16.6**

  - [x] 16.4 Write property test for Property 4: base_url trailing slash is always stripped
    - Generate `base_url` values with 0–5 trailing slashes; verify all requests target URL without trailing slash before path
    - **Property 4: base_url trailing slash is always stripped**
    - **Validates: Requirements 2.5**

  - [x] 16.5 Write property test for Property 5: invalid base_url raises GateCtrConfigError
    - Use `invalid_base_url` strategy (ftp://, not-a-url, empty, //no-scheme)
    - **Property 5: Invalid base_url raises GateCtrConfigError**
    - **Validates: Requirements 2.6, 16.5**

  - [x] 16.6 Write property test for Property 6: all requests carry required authentication and User-Agent headers
    - Intercept outgoing requests via `respx`; verify `Authorization`, `User-Agent`, and `Content-Type` (POST only) on every call
    - **Property 6: All requests carry required authentication and User-Agent headers**
    - **Validates: Requirements 8.1, 8.2, 8.3**

  - [x] 16.7 Write property test for Property 7: GateCtr metadata is correctly extracted from response headers and body
    - Generate arbitrary `metadata_headers` dicts and `tokens_saved` values; verify `GateCtrMetadata` fields match exactly
    - **Property 7: GateCtr metadata is correctly extracted from response headers and body**
    - **Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7, 4.3**

  - [x] 16.8 Write property test for Property 8: per-request options override client-level defaults
    - Generate arbitrary client-level `optimize`/`route` and per-request `PerRequestOptions`; verify request body contains correct merged values
    - **Property 8: Per-request options override client-level defaults**
    - **Validates: Requirements 3.8, 4.4**

  - [x] 16.9 Write property test for Property 9: SSE stream chunks are correctly parsed and order-preserving
    - Generate `stream_chunk_seq`; verify one `StreamChunk` per non-`[DONE]` line and concatenated deltas match original text regardless of split
    - **Property 9: SSE stream chunks are correctly parsed and order-preserving**
    - **Validates: Requirements 5.2, 5.3, 13.4c**

  - [x] 16.10 Write property test for Property 10: non-2xx responses raise GateCtrApiError with correct status
    - Generate arbitrary non-2xx status codes (after retries exhausted); verify `GateCtrApiError.status` matches
    - **Property 10: Non-2xx responses raise GateCtrApiError with correct status**
    - **Validates: Requirements 9.2, 9.3**

  - [x] 16.11 Write property test for Property 11: retryable codes trigger N+1 attempts; non-retryable codes do not retry
    - For retryable statuses with any `max_retries` N: verify exactly N+1 HTTP calls
    - For non-retryable statuses: verify exactly 1 HTTP call
    - **Property 11: Retryable status codes trigger retry up to max_retries; non-retryable codes do not retry**
    - **Validates: Requirements 10.1, 10.3, 10.5**

  - [x] 16.12 Write property test for Property 12: retry backoff delays are monotonically non-decreasing
    - For attempts 0..N, verify `backoff_seconds(k) >= backoff_seconds(k-1)` (base component, excluding jitter)
    - **Property 12: Retry backoff delays are monotonically non-decreasing**
    - **Validates: Requirements 10.2**

  - [x] 16.13 Write property test for Property 13: CompleteResponse round-trips through Pydantic JSON serialization without data loss
    - Use `complete_response_dict` strategy; verify `model_dump_json()` → `model_validate_json()` preserves all `gatectr` metadata fields
    - **Property 13: CompleteResponse round-trips through Pydantic JSON serialization without data loss**
    - **Validates: Requirements 3.2, 13.4b**

  - [x] 16.14 Write property test for Property 14: GateCtrApiError.to_dict() is safe for logging
    - Generate arbitrary `status`, `code`, `request_id`, `message`; verify `to_dict()` keys are exactly `{"name", "message", "status", "code", "request_id"}` and no value equals `api_key`
    - **Property 14: GateCtrApiError.to_dict() is safe for logging**
    - **Validates: Requirements 9.6**

  - [x] 16.15 Write property test for Property 15: usage() query parameters are correctly forwarded
    - Generate arbitrary `UsageParams` combinations; verify outgoing GET request query string contains exactly the non-None params with `from_` serialized as `from`
    - **Property 15: usage() query parameters are correctly forwarded**
    - **Validates: Requirements 7.1, 7.3**

- [x] 17. Create GitHub Actions workflows
  - [x] 17.1 Create `.github/workflows/ci.yml` — runs on push/PR to `main` and `develop`; matrix strategy for Python 3.9, 3.10, 3.11, 3.12; jobs: `hatch run lint`, `hatch run typecheck`, `hatch run test-cov`, `hatch build`
    - _Requirements: 15.1, 15.3, 18.9_

  - [x] 17.2 Create `.github/workflows/pr-checks.yml` — runs on pull_request (opened, synchronize, reopened); jobs: `pr-title` using `amannn/action-semantic-pull-request@v5`, `conflict-check` using `actions/github-script`
    - _Requirements: 15.5, 18.10_

  - [x] 17.3 Create `.github/workflows/publish.yml` — triggers on `push` to tags `v*.*.*`; runs full CI then publishes to PyPI using OIDC Trusted Publisher (`pypa/gh-action-pypi-publish@release/v1`); requires `id-token: write` permission
    - _Requirements: 15.2, 15.4_

  - [x] 17.4 Create `.github/workflows/release.yml` — triggers on `push` to tags `v*.*.*`; uses `softprops/action-gh-release@v2` with `generate_release_notes: true`; sets `prerelease: true` when tag contains `alpha`, `beta`, or `rc`
    - _Requirements: 15.5_

- [x] 18. Final checkpoint — verify full scaffold
  - Run `hatch run lint` — zero ruff errors
  - Run `hatch run typecheck` — zero mypy errors
  - Run `hatch run test-cov` — all tests pass, ≥80% line coverage
  - Run `hatch build` — `dist/` contains sdist and wheel
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Git initialization and branch setup
  - Stage all files: `git add .`
  - Create initial commit on `main`: `git commit -m "chore: initial sdk scaffold"`
  - Create `develop` branch: `git checkout -b develop`
  - _Requirements: 18.1, 18.2, 18.4_

## Notes

- All property tests reference a numbered property from the design document
- Property tests are required (not optional) — they validate universal correctness guarantees
- The `conftest.py` fixtures (task 10) must be created before any unit tests
- `gatectr/__init__.py` (task 9) should be created after all source modules so barrel exports resolve cleanly
- Git operations in tasks 1 and 19 must be run inside `sdk-python/` — not the monorepo root
- `SyncGateCtr` is not suitable for use inside an already-running event loop (e.g., Jupyter) — callers should use `GateCtr` directly in those contexts
- The `py.typed` marker (task 3.2) enables type checkers to recognize `gatectr` as a typed package per PEP 561
