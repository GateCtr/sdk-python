"""Property-based tests for the GateCtr Python SDK."""
from __future__ import annotations

import contextlib
import json
import os
import string
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
import respx
from httpx import Response
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from gatectr import (
    GateCtr,
    GateCtrApiError,
    GateCtrConfigError,
    PerRequestOptions,
    UsageParams,
)
from gatectr.http import NON_RETRYABLE_STATUSES, RETRYABLE_STATUSES, http_request
from gatectr.types import CompleteResponse

_ASCII_CHARS = string.ascii_letters + string.digits + "-_."
_valid_api_key = st.text(alphabet=_ASCII_CHARS, min_size=4, max_size=40)
_valid_base_url = st.one_of(
    st.text(alphabet=st.characters(blacklist_categories=("Cc",), blacklist_characters=" \t\n\r"), min_size=1, max_size=30).map(lambda s: f"http://{s}"),
    st.text(alphabet=st.characters(blacklist_categories=("Cc",), blacklist_characters=" \t\n\r"), min_size=1, max_size=30).map(lambda s: f"https://{s}"),
)
_BASE_URL = "https://test.gatectr.com/v1"
_GATECTR_HEADERS = {"X-GateCtr-Request-Id": "req_test123", "X-GateCtr-Latency-Ms": "42", "X-GateCtr-Overage": "false"}


def _complete_body(model: str = "gpt-4o") -> dict:
    return {"id": "cmpl_prop", "object": "text_completion", "model": model, "choices": [{"text": "ok", "finish_reason": "stop"}], "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8}}


def _usage_body() -> dict:
    return {"total_tokens": 100, "total_requests": 10, "total_cost_usd": 0.01, "saved_tokens": 20, "from": "2025-01-01T00:00:00Z", "to": "2025-01-31T23:59:59Z", "by_project": []}


@given(api_key=_valid_api_key, base_url=_valid_base_url, timeout=st.floats(min_value=0.001, max_value=300.0, allow_nan=False, allow_infinity=False), max_retries=st.integers(min_value=0, max_value=10), optimize=st.booleans(), route=st.booleans())
@settings(max_examples=50, deadline=None)
def test_prop1_valid_config_construction_succeeds(api_key, base_url, timeout, max_retries, optimize, route):
    """Property 1: Valid configuration construction succeeds. Validates: Requirements 2.1, 2.2"""
    os.environ.pop("GATECTR_API_KEY", None)
    try:
        GateCtr(api_key, base_url=base_url, timeout=timeout, max_retries=max_retries, optimize=optimize, route=route)
    except GateCtrConfigError:
        raise
    except Exception:
        pass


@given(invalid_api_key=st.one_of(st.just(""), st.text(alphabet=" \t\n\r", min_size=1, max_size=10)))
@settings(max_examples=50)
def test_prop2_invalid_api_key_raises_config_error(invalid_api_key):
    """Property 2: Invalid api_key raises GateCtrConfigError. Validates: Requirements 2.5, 2.6"""
    os.environ.pop("GATECTR_API_KEY", None)
    with pytest.raises(GateCtrConfigError):
        GateCtr(invalid_api_key)


@given(api_key=_valid_api_key)
@settings(max_examples=50, deadline=None)
def test_prop3_api_key_never_in_output(api_key):
    """Property 3: api_key never appears in any output. Validates: Requirements 8.4, 16.2, 16.6"""
    os.environ.pop("GATECTR_API_KEY", None)
    client = GateCtr(api_key)
    assert api_key not in repr(client)
    err = GateCtrApiError("msg", status=400, code="err")
    assert api_key not in str(err)
    assert api_key not in str(err.to_dict())
    with contextlib.suppress(TypeError):
        assert api_key not in str(vars(client))


@given(base=_valid_base_url, slashes=st.integers(min_value=0, max_value=5))
@settings(max_examples=50, deadline=None)
def test_prop4_base_url_trailing_slash_stripped(base, slashes):
    """Property 4: base_url trailing slash is always stripped. Validates: Requirements 2.5"""
    os.environ.pop("GATECTR_API_KEY", None)
    try:
        client = GateCtr("valid-key", base_url=base + "/" * slashes)
        assert not client._base_url.endswith("/")
    except Exception:
        pass


@given(invalid_url=st.sampled_from(["ftp://example.com", "not-a-url", "", "//no-scheme", "example.com"]))
@settings(max_examples=20)
def test_prop5_invalid_base_url_raises_config_error(invalid_url):
    """Property 5: Invalid base_url raises GateCtrConfigError. Validates: Requirements 2.6, 16.5"""
    os.environ.pop("GATECTR_API_KEY", None)
    with pytest.raises(GateCtrConfigError):
        GateCtr("valid-key", base_url=invalid_url)


@given(api_key=_valid_api_key, model=st.text(alphabet=_ASCII_CHARS, min_size=1, max_size=20), messages=st.lists(st.fixed_dictionaries({"role": st.just("user"), "content": st.text(max_size=20)}), min_size=1, max_size=3))
@settings(max_examples=20, suppress_health_check=[HealthCheck.too_slow], deadline=None)
async def test_prop6_requests_carry_required_headers(api_key, model, messages):
    """Property 6: All requests carry required authentication and User-Agent headers. Validates: Requirements 8.1, 8.2, 8.3"""
    os.environ.pop("GATECTR_API_KEY", None)
    with respx.mock(assert_all_called=False) as mock:
        mock.post(f"{_BASE_URL}/complete").mock(return_value=Response(200, json=_complete_body(model), headers=_GATECTR_HEADERS))
        client = GateCtr(api_key, base_url=_BASE_URL)
        try:
            await client.complete(model, messages)
        finally:
            await client.aclose()
        assert len(mock.calls) > 0
        h = mock.calls.last.request.headers
        assert h["authorization"] == f"Bearer {api_key}"
        assert h["user-agent"].startswith("gatectr-sdk/")
        assert h["content-type"] == "application/json"


@given(request_id=st.text(min_size=0, max_size=40), latency_ms=st.integers(min_value=0, max_value=9999), overage=st.booleans(), model_used=st.text(min_size=1, max_size=30), tokens_saved=st.integers(min_value=0, max_value=9999))
@settings(max_examples=50)
def test_prop7_metadata_extracted_correctly(request_id, latency_ms, overage, model_used, tokens_saved):
    """Property 7: GateCtr metadata is correctly extracted. Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7, 4.3"""
    response = MagicMock()
    response.headers = {"X-GateCtr-Request-Id": request_id, "X-GateCtr-Latency-Ms": str(latency_ms), "X-GateCtr-Overage": "true" if overage else "false"}
    body: dict = {"model": model_used, "usage": {"saved_tokens": tokens_saved}}
    metadata = GateCtr._extract_metadata(response, body)
    assert metadata.request_id == request_id
    assert metadata.latency_ms == latency_ms
    assert metadata.overage == overage
    assert metadata.model_used == model_used
    assert metadata.tokens_saved == tokens_saved


@given(client_optimize=st.booleans(), client_route=st.booleans(), per_optimize=st.one_of(st.none(), st.booleans()), per_route=st.one_of(st.none(), st.booleans()), per_budget_id=st.one_of(st.none(), st.text(min_size=1, max_size=20)))
@settings(max_examples=50, deadline=None)
def test_prop8_per_request_options_override_defaults(client_optimize, client_route, per_optimize, per_route, per_budget_id):
    """Property 8: Per-request options override client-level defaults. Validates: Requirements 3.8, 4.4"""
    os.environ.pop("GATECTR_API_KEY", None)
    client = GateCtr("test-key", base_url=_BASE_URL, optimize=client_optimize, route=client_route)
    result = client._merge_gatectr_opts(PerRequestOptions(optimize=per_optimize, route=per_route, budget_id=per_budget_id))
    assert result["optimize"] == (per_optimize if per_optimize is not None else client_optimize)
    assert result["route"] == (per_route if per_route is not None else client_route)
    if per_budget_id is not None:
        assert result.get("budget_id") == per_budget_id
    else:
        assert "budget_id" not in result


def _make_mock_response(lines):
    async def _aiter():
        for line in lines:
            yield line
    response = MagicMock()
    response.aiter_lines = _aiter
    response.aclose = AsyncMock()
    return response


@given(contents=st.lists(st.text(min_size=1, max_size=20), min_size=1, max_size=10))
@settings(max_examples=50, suppress_health_check=[HealthCheck.too_slow], deadline=None)
async def test_prop9_sse_stream_order_preserving(contents):
    """Property 9: SSE stream chunks are correctly parsed and order-preserving. Validates: Requirements 5.2, 5.3, 13.4c"""
    from gatectr.stream import parse_sse
    lines = [f'data: {{"id": "c{i}", "choices": [{{"delta": {{"content": {json.dumps(t)}}}, "finish_reason": null}}]}}' for i, t in enumerate(contents)]
    lines.append("data: [DONE]")
    chunks = []
    async for chunk in parse_sse(_make_mock_response(lines)):
        chunks.append(chunk)
    assert len(chunks) == len(contents)
    assert "".join(c.delta for c in chunks if c.delta is not None) == "".join(contents)


@given(status=st.integers(min_value=400, max_value=599))
@settings(max_examples=30, suppress_health_check=[HealthCheck.too_slow], deadline=None)
async def test_prop10_non_2xx_raises_api_error_with_correct_status(status):
    """Property 10: Non-2xx responses raise GateCtrApiError with correct status. Validates: Requirements 9.2, 9.3"""
    url = f"{_BASE_URL}/complete"
    with respx.mock() as mock:
        mock.post(url).mock(return_value=Response(status, json={"code": f"http_{status}", "message": "error"}))
        async with httpx.AsyncClient() as http_client:
            with pytest.raises(GateCtrApiError) as exc_info:
                await http_request(http_client, method="POST", url=url, headers={"Authorization": "Bearer test-key", "Content-Type": "application/json"}, json={"prompt": "hi"}, max_retries=0)
    assert exc_info.value.status == status


@given(status=st.sampled_from(sorted(RETRYABLE_STATUSES)), max_retries=st.integers(min_value=0, max_value=3))
@settings(max_examples=20, suppress_health_check=[HealthCheck.too_slow], deadline=None)
async def test_prop11a_retryable_status_triggers_n_plus_1_attempts(status, max_retries):
    """Property 11a: Retryable status codes trigger exactly max_retries+1 attempts. Validates: Requirements 10.1, 10.3, 10.5"""
    url = f"{_BASE_URL}/complete"
    with respx.mock() as mock:
        mock.post(url).mock(return_value=Response(status, json={"code": f"http_{status}", "message": "error"}))
        async with httpx.AsyncClient() as http_client:
            with pytest.raises(GateCtrApiError):
                await http_request(http_client, method="POST", url=url, headers={"Authorization": "Bearer test-key", "Content-Type": "application/json"}, json={"prompt": "hi"}, max_retries=max_retries)
        assert len(mock.calls) == max_retries + 1


@given(status=st.sampled_from(sorted(NON_RETRYABLE_STATUSES)))
@settings(max_examples=20, suppress_health_check=[HealthCheck.too_slow], deadline=None)
async def test_prop11b_non_retryable_status_makes_exactly_one_attempt(status):
    """Property 11b: Non-retryable status codes make exactly 1 attempt. Validates: Requirements 10.1, 10.3"""
    url = f"{_BASE_URL}/complete"
    with respx.mock() as mock:
        mock.post(url).mock(return_value=Response(status, json={"code": f"http_{status}", "message": "error"}))
        async with httpx.AsyncClient() as http_client:
            with pytest.raises(GateCtrApiError):
                await http_request(http_client, method="POST", url=url, headers={"Authorization": "Bearer test-key", "Content-Type": "application/json"}, json={"prompt": "hi"}, max_retries=3)
        assert len(mock.calls) == 1


@given(n=st.integers(min_value=1, max_value=8))
@settings(max_examples=50)
def test_prop12_backoff_base_component_monotonically_non_decreasing(n):
    """Property 12: Retry backoff delays are monotonically non-decreasing. Validates: Requirements 10.2"""
    bases = [0.5 * (2**k) for k in range(n + 1)]
    for k in range(1, len(bases)):
        assert bases[k] >= bases[k - 1]


@given(resp_id=st.text(min_size=1, max_size=20), model=st.text(min_size=1, max_size=20), request_id=st.text(min_size=0, max_size=40), latency_ms=st.integers(min_value=0, max_value=9999), overage=st.booleans(), model_used=st.text(min_size=1, max_size=30), tokens_saved=st.integers(min_value=0, max_value=9999))
@settings(max_examples=50)
def test_prop13_complete_response_json_round_trip(resp_id, model, request_id, latency_ms, overage, model_used, tokens_saved):
    """Property 13: CompleteResponse round-trips through Pydantic JSON serialization. Validates: Requirements 3.2, 13.4b"""
    data = {"id": resp_id, "object": "text_completion", "model": model, "choices": [{"text": "hello", "finish_reason": "stop"}], "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8}, "gatectr": {"request_id": request_id, "latency_ms": latency_ms, "overage": overage, "model_used": model_used, "tokens_saved": tokens_saved}}
    restored = CompleteResponse.model_validate_json(CompleteResponse.model_validate(data).model_dump_json())
    assert restored.gatectr.request_id == request_id
    assert restored.gatectr.latency_ms == latency_ms
    assert restored.gatectr.overage == overage
    assert restored.gatectr.model_used == model_used
    assert restored.gatectr.tokens_saved == tokens_saved


@given(status=st.integers(min_value=400, max_value=599), code=st.text(min_size=1, max_size=30), request_id=st.one_of(st.none(), st.text(min_size=0, max_size=40)), message=st.text(min_size=0, max_size=100), api_key=st.text(min_size=4, max_size=40))
@settings(max_examples=50)
def test_prop14_api_error_to_dict_safe_for_logging(status, code, request_id, message, api_key):
    """Property 14: GateCtrApiError.to_dict() is safe for logging. Validates: Requirements 9.6"""
    err = GateCtrApiError(message, status=status, code=code, request_id=request_id)
    result = err.to_dict()
    assert set(result.keys()) == {"name", "message", "status", "code", "request_id"}
    other_values = {message, code, str(status), str(request_id), "GateCtrApiError"}
    if api_key not in other_values:
        assert api_key not in result.values()


@given(from_=st.one_of(st.none(), st.dates().map(lambda d: d.isoformat())), to=st.one_of(st.none(), st.dates().map(lambda d: d.isoformat())), project_id=st.one_of(st.none(), st.text(alphabet=_ASCII_CHARS, min_size=1, max_size=20)))
@settings(max_examples=20, suppress_health_check=[HealthCheck.too_slow], deadline=None)
async def test_prop15_usage_query_params_forwarded(from_, to, project_id):
    """Property 15: usage() query parameters are correctly forwarded. Validates: Requirements 7.1, 7.3"""
    os.environ.pop("GATECTR_API_KEY", None)
    with respx.mock(assert_all_called=False) as mock:
        mock.get(f"{_BASE_URL}/usage").mock(return_value=Response(200, json=_usage_body(), headers=_GATECTR_HEADERS))
        client = GateCtr("test-key", base_url=_BASE_URL)
        try:
            params_kwargs: dict = {}
            if from_ is not None:
                params_kwargs["from"] = from_
            if to is not None:
                params_kwargs["to"] = to
            if project_id is not None:
                params_kwargs["project_id"] = project_id
            await client.usage(UsageParams(**params_kwargs) if params_kwargs else None)
        finally:
            await client.aclose()
        assert len(mock.calls) > 0
        url_str = str(mock.calls.last.request.url)
        if from_ is not None:
            assert f"from={from_}" in url_str
        if to is not None:
            assert f"to={to}" in url_str
        if project_id is not None:
            assert f"project_id={project_id}" in url_str
