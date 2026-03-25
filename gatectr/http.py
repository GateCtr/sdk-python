from __future__ import annotations

import asyncio
import contextlib
import random

import httpx

from .errors import GateCtrApiError, GateCtrNetworkError, GateCtrTimeoutError

RETRYABLE_STATUSES: frozenset[int] = frozenset({429, 500, 502, 503, 504})
NON_RETRYABLE_STATUSES: frozenset[int] = frozenset({400, 401, 403, 404})


def backoff_seconds(attempt: int) -> float:
    """Exponential backoff: base=0.5s * 2**attempt + jitter(0–0.1s), cap 10s."""
    base: float = 0.5 * (2**attempt)
    jitter: float = random.uniform(0.0, 0.1)
    result: float = min(base + jitter, 10.0)
    return result


async def http_request(
    client: httpx.AsyncClient,
    *,
    method: str,
    url: str,
    headers: dict[str, str],
    json: object | None = None,
    params: dict[str, str] | None = None,
    max_retries: int,
    stream: bool = False,
) -> httpx.Response:
    """Execute an HTTP request with retry logic."""
    last_exc: Exception | None = None

    for attempt in range(max_retries + 1):
        try:
            if stream:
                response = await client.send(
                    client.build_request(method, url, headers=headers, json=json),
                    stream=True,
                )
                if response.status_code >= 400:
                    await response.aread()
                    _raise_for_status(response)
                return response

            response = await client.request(
                method, url, headers=headers, json=json, params=params
            )

            if response.status_code in NON_RETRYABLE_STATUSES:
                _raise_for_status(response)

            if response.status_code in RETRYABLE_STATUSES:
                if attempt < max_retries:
                    await asyncio.sleep(backoff_seconds(attempt))
                    continue
                _raise_for_status(response)

            if response.status_code >= 400:
                _raise_for_status(response)

            return response

        except (GateCtrApiError, GateCtrTimeoutError, GateCtrNetworkError):
            raise
        except httpx.TimeoutException as exc:
            timeout_val: float = 30.0
            if client.timeout and client.timeout.read is not None:
                timeout_val = float(client.timeout.read)
            raise GateCtrTimeoutError(timeout_val) from exc
        except httpx.NetworkError as exc:
            last_exc = exc
            if attempt < max_retries:
                await asyncio.sleep(backoff_seconds(attempt))
                continue
            raise GateCtrNetworkError(str(exc), cause=exc) from exc

    raise GateCtrNetworkError("All retry attempts exhausted", cause=last_exc)


def _raise_for_status(response: httpx.Response) -> None:
    body: dict[str, object] = {}
    with contextlib.suppress(Exception):
        body = response.json()
    request_id = response.headers.get("X-GateCtr-Request-Id")
    code = str(body.get("code", f"http_{response.status_code}"))
    message = str(body.get("message", response.reason_phrase))
    raise GateCtrApiError(
        message, status=response.status_code, code=code, request_id=request_id
    )
