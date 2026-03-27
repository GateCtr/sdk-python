from __future__ import annotations

import asyncio
import os
import platform
import re
from collections.abc import AsyncIterator, Iterator
from importlib.metadata import PackageNotFoundError, version

import httpx

from .errors import GateCtrConfigError
from .http import http_request
from .stream import parse_sse
from .types import (
    ChatResponse,
    CompleteResponse,
    GateCtrMetadata,
    ModelsResponse,
    PerRequestOptions,
    StreamChunk,
    UsageParams,
    UsageResponse,
    UsageTrendsParams,
    UsageTrendsResponse,
    Webhook,
    WebhooksListResponse,
    Budget,
    BudgetGetResponse,
    ProviderKey,
)

try:
    _SDK_VERSION = version("gatectr-sdk")
except PackageNotFoundError:
    _SDK_VERSION = "0.0.0"

_PYTHON_VERSION = platform.python_version()


class GateCtr:
    """Async GateCtr client. All methods are coroutines."""

    __slots__ = ("_api_key", "_base_url", "_timeout", "_max_retries", "_optimize", "_route", "_http")

    # Slot type annotations for mypy
    _api_key: str
    _base_url: str
    _timeout: float
    _max_retries: int
    _optimize: bool
    _route: bool
    _http: httpx.AsyncClient

    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str = "https://api.gatectr.com/v1",
        timeout: float = 30.0,
        max_retries: int = 3,
        optimize: bool = True,
        route: bool = False,
    ) -> None:
        resolved_key = api_key or os.environ.get("GATECTR_API_KEY", "")
        if not resolved_key or not resolved_key.strip():
            raise GateCtrConfigError(
                "api_key is required. Pass it directly or set GATECTR_API_KEY."
            )
        if not re.match(r"^https?://", base_url):
            raise GateCtrConfigError(
                f"base_url must be a valid HTTP or HTTPS URL, got: {base_url!r}"
            )
        object.__setattr__(self, "_api_key", resolved_key)
        object.__setattr__(self, "_base_url", base_url.rstrip("/"))
        object.__setattr__(self, "_timeout", timeout)
        object.__setattr__(self, "_max_retries", max_retries)
        object.__setattr__(self, "_optimize", optimize)
        object.__setattr__(self, "_route", route)
        object.__setattr__(
            self,
            "_http",
            httpx.AsyncClient(
                timeout=httpx.Timeout(timeout),
                headers=self._base_headers(),
            ),
        )

    def __repr__(self) -> str:
        return (
            f"GateCtr(base_url={self._base_url!r}, "
            f"api_key='[REDACTED]', max_retries={self._max_retries})"
        )

    def _base_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "User-Agent": f"gatectr-sdk/{_SDK_VERSION} python/{_PYTHON_VERSION}",
        }

    def _merge_gatectr_opts(self, per_request: PerRequestOptions | None) -> dict[str, object]:
        opts: dict[str, object] = {
            "optimize": self._optimize,
            "route": self._route,
        }
        if per_request:
            if per_request.optimize is not None:
                opts["optimize"] = per_request.optimize
            if per_request.route is not None:
                opts["route"] = per_request.route
            if per_request.budget_id is not None:
                opts["budget_id"] = per_request.budget_id
        return opts

    @staticmethod
    def _extract_metadata(response: httpx.Response, body: dict[str, object]) -> GateCtrMetadata:
        raw_usage = body.get("usage")
        usage: dict[str, object] = raw_usage if isinstance(raw_usage, dict) else {}
        return GateCtrMetadata(
            request_id=response.headers.get("X-GateCtr-Request-Id", ""),
            latency_ms=int(response.headers.get("X-GateCtr-Latency-Ms", 0)),
            overage=response.headers.get("X-GateCtr-Overage", "").lower() == "true",
            model_used=str(body.get("model", "")),
            tokens_saved=int(saved) if isinstance(saved := usage.get("saved_tokens"), (int, float)) else 0,
        )

    async def complete(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        max_tokens: int | None = None,
        temperature: float | None = None,
        gatectr: PerRequestOptions | None = None,
    ) -> CompleteResponse:
        body: dict[str, object] = {
            "model": model,
            "messages": messages,
            "stream": False,
            **self._merge_gatectr_opts(gatectr),
        }
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        if temperature is not None:
            body["temperature"] = temperature

        resp = await http_request(
            self._http,
            method="POST",
            url=f"{self._base_url}/complete",
            headers={"Content-Type": "application/json"},
            json=body,
            max_retries=self._max_retries,
        )
        data: dict[str, object] = resp.json()
        data["gatectr"] = self._extract_metadata(resp, data).model_dump()
        return CompleteResponse.model_validate(data)

    async def chat(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        max_tokens: int | None = None,
        temperature: float | None = None,
        gatectr: PerRequestOptions | None = None,
    ) -> ChatResponse:
        body: dict[str, object] = {
            "model": model,
            "messages": messages,
            "stream": False,
            **self._merge_gatectr_opts(gatectr),
        }
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        if temperature is not None:
            body["temperature"] = temperature

        resp = await http_request(
            self._http,
            method="POST",
            url=f"{self._base_url}/chat",
            headers={"Content-Type": "application/json"},
            json=body,
            max_retries=self._max_retries,
        )
        data: dict[str, object] = resp.json()
        data["gatectr"] = self._extract_metadata(resp, data).model_dump()
        return ChatResponse.model_validate(data)

    async def stream(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        max_tokens: int | None = None,
        temperature: float | None = None,
        gatectr: PerRequestOptions | None = None,
    ) -> AsyncIterator[StreamChunk]:
        body: dict[str, object] = {
            "model": model,
            "messages": messages,
            "stream": True,
            **self._merge_gatectr_opts(gatectr),
        }
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        if temperature is not None:
            body["temperature"] = temperature

        resp = await http_request(
            self._http,
            method="POST",
            url=f"{self._base_url}/chat",
            headers={"Content-Type": "application/json"},
            json=body,
            max_retries=self._max_retries,
            stream=True,
        )
        return parse_sse(resp)

    async def models(self) -> ModelsResponse:
        resp = await http_request(
            self._http,
            method="GET",
            url=f"{self._base_url}/models",
            headers={},
            max_retries=self._max_retries,
        )
        data: dict[str, object] = resp.json()
        data["request_id"] = resp.headers.get("X-GateCtr-Request-Id", "")
        return ModelsResponse.model_validate(data)

    async def usage(self, params: UsageParams | None = None) -> UsageResponse:
        query: dict[str, str] = {}
        if params:
            if params.from_:
                query["from"] = params.from_
            if params.to:
                query["to"] = params.to
            if params.project_id:
                query["project_id"] = params.project_id

        resp = await http_request(
            self._http,
            method="GET",
            url=f"{self._base_url}/usage",
            headers={},
            params=query or None,
            max_retries=self._max_retries,
        )
        return UsageResponse.model_validate(resp.json())

    async def usage_trends(self, params: UsageTrendsParams | None = None) -> UsageTrendsResponse:
        """Fetch usage trends (time series) — GET /usage/trends. Requires scope: read."""
        query: dict[str, str] = {}
        if params:
            if params.from_:
                query["from"] = params.from_
            if params.to:
                query["to"] = params.to
            if params.project_id:
                query["projectId"] = params.project_id
            if params.granularity:
                query["granularity"] = params.granularity

        resp = await http_request(
            self._http,
            method="GET",
            url=f"{self._base_url}/usage/trends",
            headers={},
            params=query or None,
            max_retries=self._max_retries,
        )
        return UsageTrendsResponse.model_validate(resp.json())

    # ── Webhooks ──────────────────────────────────────────────────────────────

    async def list_webhooks(self) -> WebhooksListResponse:
        """List webhooks — GET /webhooks. Requires scope: read."""
        resp = await http_request(
            self._http, method="GET", url=f"{self._base_url}/webhooks",
            headers={}, max_retries=self._max_retries,
        )
        return WebhooksListResponse.model_validate(resp.json())

    async def create_webhook(self, name: str, url: str, events: list[str] | None = None) -> Webhook:
        """Create a webhook — POST /webhooks. Requires scope: admin."""
        body: dict[str, object] = {"name": name, "url": url}
        if events is not None:
            body["events"] = events
        resp = await http_request(
            self._http, method="POST", url=f"{self._base_url}/webhooks",
            headers={"Content-Type": "application/json"}, json=body,
            max_retries=self._max_retries,
        )
        return Webhook.model_validate(resp.json())

    async def update_webhook(self, webhook_id: str, **kwargs: object) -> Webhook:
        """Update a webhook — PATCH /webhooks/{id}. Requires scope: admin."""
        resp = await http_request(
            self._http, method="PATCH", url=f"{self._base_url}/webhooks/{webhook_id}",
            headers={"Content-Type": "application/json"}, json=kwargs,
            max_retries=self._max_retries,
        )
        return Webhook.model_validate(resp.json())

    async def delete_webhook(self, webhook_id: str) -> None:
        """Delete a webhook — DELETE /webhooks/{id}. Requires scope: admin."""
        await http_request(
            self._http, method="DELETE", url=f"{self._base_url}/webhooks/{webhook_id}",
            headers={}, max_retries=self._max_retries,
        )

    # ── Budget ────────────────────────────────────────────────────────────────

    async def get_budget(self) -> BudgetGetResponse:
        """Get budget configuration — GET /budget. Requires scope: read."""
        resp = await http_request(
            self._http, method="GET", url=f"{self._base_url}/budget",
            headers={}, max_retries=self._max_retries,
        )
        return BudgetGetResponse.model_validate(resp.json())

    async def set_budget(self, **kwargs: object) -> Budget:
        """Set budget — POST /budget. Requires scope: admin."""
        resp = await http_request(
            self._http, method="POST", url=f"{self._base_url}/budget",
            headers={"Content-Type": "application/json"}, json=kwargs,
            max_retries=self._max_retries,
        )
        return Budget.model_validate(resp.json())

    # ── Provider Keys ─────────────────────────────────────────────────────────

    async def list_provider_keys(self) -> list[ProviderKey]:
        """List provider keys — GET /provider-keys. Requires scope: read."""
        resp = await http_request(
            self._http, method="GET", url=f"{self._base_url}/provider-keys",
            headers={}, max_retries=self._max_retries,
        )
        return [ProviderKey.model_validate(k) for k in resp.json()]

    async def add_provider_key(self, provider: str, api_key: str, name: str = "Default") -> ProviderKey:
        """Add a provider key — POST /provider-keys. Requires scope: admin."""
        resp = await http_request(
            self._http, method="POST", url=f"{self._base_url}/provider-keys",
            headers={"Content-Type": "application/json"},
            json={"provider": provider, "apiKey": api_key, "name": name},
            max_retries=self._max_retries,
        )
        return ProviderKey.model_validate(resp.json())

    async def remove_provider_key(self, key_id: str, hard: bool = False) -> None:
        """Remove a provider key — DELETE /provider-keys/{id}. Requires scope: admin."""
        url = f"{self._base_url}/provider-keys/{key_id}"
        if hard:
            url += "?hard=true"
        await http_request(
            self._http, method="DELETE", url=url,
            headers={}, max_retries=self._max_retries,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> GateCtr:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()


class SyncGateCtr:
    """Synchronous wrapper over GateCtr. Uses asyncio.run() per call."""

    def __init__(self, api_key: str | None = None, **kwargs: object) -> None:
        self._async = GateCtr(api_key, **kwargs)  # type: ignore[arg-type]

    def __repr__(self) -> str:
        return repr(self._async).replace("GateCtr(", "SyncGateCtr(", 1)

    def complete(
        self, model: str, messages: list[dict[str, str]], **kwargs: object
    ) -> CompleteResponse:
        return asyncio.run(self._async.complete(model, messages, **kwargs))  # type: ignore[arg-type]

    def chat(
        self, model: str, messages: list[dict[str, str]], **kwargs: object
    ) -> ChatResponse:
        return asyncio.run(self._async.chat(model, messages, **kwargs))  # type: ignore[arg-type]

    def stream(
        self, model: str, messages: list[dict[str, str]], **kwargs: object
    ) -> Iterator[StreamChunk]:
        """Synchronous streaming — collects all chunks via asyncio.run()."""

        async def _collect() -> list[StreamChunk]:
            chunks: list[StreamChunk] = []
            async for chunk in await self._async.stream(model, messages, **kwargs):  # type: ignore[arg-type]
                chunks.append(chunk)
            return chunks

        yield from asyncio.run(_collect())

    def models(self) -> ModelsResponse:
        return asyncio.run(self._async.models())

    def usage(self, params: UsageParams | None = None) -> UsageResponse:
        return asyncio.run(self._async.usage(params))

    def usage_trends(self, params: UsageTrendsParams | None = None) -> UsageTrendsResponse:
        return asyncio.run(self._async.usage_trends(params))

    def list_webhooks(self) -> WebhooksListResponse:
        return asyncio.run(self._async.list_webhooks())

    def create_webhook(self, name: str, url: str, events: list[str] | None = None) -> Webhook:
        return asyncio.run(self._async.create_webhook(name, url, events))

    def update_webhook(self, webhook_id: str, **kwargs: object) -> Webhook:
        return asyncio.run(self._async.update_webhook(webhook_id, **kwargs))

    def delete_webhook(self, webhook_id: str) -> None:
        asyncio.run(self._async.delete_webhook(webhook_id))

    def get_budget(self) -> BudgetGetResponse:
        return asyncio.run(self._async.get_budget())

    def set_budget(self, **kwargs: object) -> Budget:
        return asyncio.run(self._async.set_budget(**kwargs))

    def list_provider_keys(self) -> list[ProviderKey]:
        return asyncio.run(self._async.list_provider_keys())

    def add_provider_key(self, provider: str, api_key: str, name: str = "Default") -> ProviderKey:
        return asyncio.run(self._async.add_provider_key(provider, api_key, name))

    def remove_provider_key(self, key_id: str, hard: bool = False) -> None:
        asyncio.run(self._async.remove_provider_key(key_id, hard))
