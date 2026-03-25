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
