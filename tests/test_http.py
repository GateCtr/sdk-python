"""Unit tests for gatectr.http — retry logic, error mapping, and header injection."""
from __future__ import annotations

import httpx
import pytest
import respx
from httpx import Response

from gatectr import GateCtrApiError, GateCtrNetworkError, GateCtrTimeoutError
from gatectr.http import (
    NON_RETRYABLE_STATUSES,
    RETRYABLE_STATUSES,
    http_request,
)

_BASE_URL = "https://test.gatectr.com/v1"
_URL = f"{_BASE_URL}/complete"
_HEADERS = {"Authorization": "Bearer test-key", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _error_body(status: int) -> dict[str, object]:
    return {"code": f"http_{status}", "message": "error"}


# ---------------------------------------------------------------------------
# 12.1 — Retry count tests
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("status", sorted(RETRYABLE_STATUSES))
async def test_retryable_status_exhausts_all_attempts(status: int) -> None:
    """Retryable status codes trigger exactly max_retries + 1 total HTTP attempts."""
    max_retries = 2

    with respx.mock() as mock:
        mock.post(_URL).mock(return_value=Response(status, json=_error_body(status)))

        async with httpx.AsyncClient() as client:
            with pytest.raises(GateCtrApiError) as exc_info:
                await http_request(
                    client,
                    method="POST",
                    url=_URL,
                    headers=_HEADERS,
                    json={"prompt": "hi"},
                    max_retries=max_retries,
                )

        assert exc_info.value.status == status
        assert len(mock.calls) == max_retries + 1


@pytest.mark.parametrize("status", sorted(NON_RETRYABLE_STATUSES))
async def test_non_retryable_status_raises_on_first_attempt(status: int) -> None:
    """Non-retryable status codes raise GateCtrApiError on the first attempt with no retries."""
    with respx.mock() as mock:
        mock.post(_URL).mock(return_value=Response(status, json=_error_body(status)))

        async with httpx.AsyncClient() as client:
            with pytest.raises(GateCtrApiError) as exc_info:
                await http_request(
                    client,
                    method="POST",
                    url=_URL,
                    headers=_HEADERS,
                    json={"prompt": "hi"},
                    max_retries=3,
                )

        assert exc_info.value.status == status
        assert len(mock.calls) == 1


# ---------------------------------------------------------------------------
# 12.2 — Edge case tests
# ---------------------------------------------------------------------------


async def test_max_retries_zero_makes_exactly_one_attempt() -> None:
    """max_retries=0 makes exactly 1 attempt and raises immediately on a retryable status."""
    with respx.mock() as mock:
        mock.post(_URL).mock(return_value=Response(500, json=_error_body(500)))

        async with httpx.AsyncClient() as client:
            with pytest.raises(GateCtrApiError):
                await http_request(
                    client,
                    method="POST",
                    url=_URL,
                    headers=_HEADERS,
                    max_retries=0,
                )

        assert len(mock.calls) == 1


async def test_timeout_raises_gatectr_timeout_error() -> None:
    """httpx.TimeoutException is mapped to GateCtrTimeoutError with the configured timeout."""
    configured_timeout = 15.0

    with respx.mock() as mock:
        mock.post(_URL).mock(side_effect=httpx.ReadTimeout("timed out", request=None))

        async with httpx.AsyncClient(timeout=httpx.Timeout(configured_timeout)) as client:
            with pytest.raises(GateCtrTimeoutError) as exc_info:
                await http_request(
                    client,
                    method="POST",
                    url=_URL,
                    headers=_HEADERS,
                    max_retries=0,
                )

    assert exc_info.value.timeout_s == configured_timeout


async def test_network_error_raises_gatectr_network_error() -> None:
    """httpx.NetworkError is mapped to GateCtrNetworkError."""
    with respx.mock() as mock:
        mock.post(_URL).mock(side_effect=httpx.ConnectError("connection refused"))

        async with httpx.AsyncClient() as client:
            with pytest.raises(GateCtrNetworkError):
                await http_request(
                    client,
                    method="POST",
                    url=_URL,
                    headers=_HEADERS,
                    max_retries=0,
                )


# ---------------------------------------------------------------------------
# 12.3 — Header injection tests (via full GateCtr client stack)
# ---------------------------------------------------------------------------


async def test_authorization_header_on_every_request(mock_api, client) -> None:
    """Every request carries Authorization: Bearer {api_key}."""
    await client.complete("gpt-4o", [{"role": "user", "content": "hi"}])
    headers = mock_api.calls.last.request.headers
    assert headers["authorization"] == "Bearer test-api-key"


async def test_user_agent_header_on_every_request(mock_api, client) -> None:
    """Every request carries a User-Agent header starting with 'gatectr-sdk/'."""
    await client.models()
    headers = mock_api.calls.last.request.headers
    assert headers["user-agent"].startswith("gatectr-sdk/")


async def test_content_type_header_on_post_requests(mock_api, client) -> None:
    """Every POST request carries Content-Type: application/json."""
    await client.complete("gpt-4o", [{"role": "user", "content": "hi"}])
    headers = mock_api.calls.last.request.headers
    assert headers["content-type"] == "application/json"


async def test_get_request_has_no_content_type(mock_api, client) -> None:
    """GET requests do not carry a Content-Type header."""
    await client.models()
    headers = mock_api.calls.last.request.headers
    # httpx may or may not include content-type on GET; it must not be application/json
    content_type = headers.get("content-type", "")
    assert "application/json" not in content_type
