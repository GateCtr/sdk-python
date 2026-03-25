"""Unit tests for GateCtr client construction and happy-path API calls."""
from __future__ import annotations

import pytest
import respx
from httpx import Response

from gatectr import (
    ChatResponse,
    CompleteResponse,
    GateCtr,
    GateCtrConfigError,
    ModelsResponse,
    SyncGateCtr,
    UsageParams,
    UsageResponse,
)

# ---------------------------------------------------------------------------
# 11.1 — GateCtr construction tests
# ---------------------------------------------------------------------------


def test_valid_config_succeeds():
    """Valid api_key + base_url constructs without error."""
    gc = GateCtr("my-api-key", base_url="https://test.gatectr.com/v1")
    assert gc._base_url == "https://test.gatectr.com/v1"


def test_missing_api_key_raises(monkeypatch):
    """No api_key arg and no env var raises GateCtrConfigError."""
    monkeypatch.delenv("GATECTR_API_KEY", raising=False)
    with pytest.raises(GateCtrConfigError):
        GateCtr()


def test_whitespace_api_key_raises(monkeypatch):
    """Whitespace-only api_key raises GateCtrConfigError."""
    monkeypatch.delenv("GATECTR_API_KEY", raising=False)
    with pytest.raises(GateCtrConfigError):
        GateCtr("   ")


def test_invalid_base_url_ftp_raises(monkeypatch):
    """ftp:// base_url raises GateCtrConfigError."""
    monkeypatch.delenv("GATECTR_API_KEY", raising=False)
    with pytest.raises(GateCtrConfigError):
        GateCtr("key", base_url="ftp://bad.example.com")


def test_invalid_base_url_no_scheme_raises(monkeypatch):
    """URL without scheme raises GateCtrConfigError."""
    monkeypatch.delenv("GATECTR_API_KEY", raising=False)
    with pytest.raises(GateCtrConfigError):
        GateCtr("key", base_url="not-a-url")


def test_env_var_fallback(monkeypatch):
    """GATECTR_API_KEY env var is used when no api_key arg is passed."""
    monkeypatch.setenv("GATECTR_API_KEY", "env-key-123")
    gc = GateCtr()
    assert gc._api_key == "env-key-123"


def test_trailing_slash_stripped():
    """Trailing slashes are stripped from base_url."""
    gc = GateCtr("key", base_url="https://test.gatectr.com/v1///")
    assert gc._base_url == "https://test.gatectr.com/v1"


def test_single_trailing_slash_stripped():
    """Single trailing slash is stripped from base_url."""
    gc = GateCtr("key", base_url="https://test.gatectr.com/v1/")
    assert gc._base_url == "https://test.gatectr.com/v1"


# ---------------------------------------------------------------------------
# 11.2 — Happy path tests
# ---------------------------------------------------------------------------


async def test_complete_happy_path(mock_api, client):
    """complete() POSTs to /complete and returns a CompleteResponse with metadata."""
    response = await client.complete("gpt-4o", [{"role": "user", "content": "Hello"}])

    assert isinstance(response, CompleteResponse)
    assert response.id == "cmpl_test123"
    assert response.model == "gpt-4o"
    assert len(response.choices) == 1
    assert response.choices[0].text == "Hello, world!"

    # GateCtr metadata populated from headers
    assert response.gatectr.request_id == "req_test123"
    assert response.gatectr.latency_ms == 42
    assert response.gatectr.overage is False

    # Verify the request was a POST to /complete
    assert mock_api.calls.last.request.method == "POST"
    assert mock_api.calls.last.request.url.path == "/v1/complete"


async def test_chat_happy_path(mock_api, client):
    """chat() POSTs to /chat and returns a ChatResponse."""
    response = await client.chat("gpt-4o", [{"role": "user", "content": "Hi"}])

    assert isinstance(response, ChatResponse)
    assert response.id == "chat_test123"
    assert response.object == "chat.completion"
    assert len(response.choices) == 1
    assert response.choices[0].message.content == "Hello! How can I help you?"

    assert mock_api.calls.last.request.method == "POST"
    assert mock_api.calls.last.request.url.path == "/v1/chat"


async def test_models_happy_path(mock_api, client):
    """models() GETs /models and returns a ModelsResponse with request_id from header."""
    response = await client.models()

    assert isinstance(response, ModelsResponse)
    assert len(response.models) == 2
    assert response.models[0].model_id == "gpt-4o"
    assert response.request_id == "req_test123"

    assert mock_api.calls.last.request.method == "GET"
    assert mock_api.calls.last.request.url.path == "/v1/models"


async def test_usage_happy_path(mock_api, client):
    """usage() GETs /usage and returns a UsageResponse."""
    response = await client.usage()

    assert isinstance(response, UsageResponse)
    assert response.total_tokens == 1000
    assert response.total_requests == 50
    assert len(response.by_project) == 2

    assert mock_api.calls.last.request.method == "GET"
    assert mock_api.calls.last.request.url.path == "/v1/usage"


async def test_usage_with_params_forwards_query(mock_api, client):
    """usage() forwards UsageParams as query parameters."""
    params = UsageParams(**{"from": "2025-01-01", "to": "2025-01-31", "project_id": "proj_abc"})
    await client.usage(params)

    last_request = mock_api.calls.last.request
    assert "from=2025-01-01" in str(last_request.url)
    assert "to=2025-01-31" in str(last_request.url)
    assert "project_id=proj_abc" in str(last_request.url)


# ---------------------------------------------------------------------------
# 11.3 — Additional tests
# ---------------------------------------------------------------------------


def test_no_network_at_import_time():
    """Importing gatectr should not make any HTTP calls."""
    # If we reach this point without respx blocking any calls, the import
    # was clean. We verify by checking that no respx routes were triggered
    # during the import phase (which already happened at the top of this file).
    with respx.mock(assert_all_called=False) as mock:
        # Re-import to simulate a fresh import in a controlled mock context
        import importlib

        import gatectr as gc_module
        importlib.reload(gc_module)
        # No routes were registered, so any HTTP call would raise an error
        assert len(mock.calls) == 0


def test_sync_gatectr_complete_delegates():
    """SyncGateCtr.complete() delegates to GateCtr and returns CompleteResponse."""
    _BASE_URL = "https://test.gatectr.com/v1"
    _HEADERS = {
        "X-GateCtr-Request-Id": "req_sync123",
        "X-GateCtr-Latency-Ms": "10",
        "X-GateCtr-Overage": "false",
    }
    _BODY = {
        "id": "cmpl_sync",
        "object": "text_completion",
        "model": "gpt-4o",
        "choices": [{"text": "sync response", "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 5, "completion_tokens": 3, "total_tokens": 8},
    }

    with respx.mock() as mock:
        mock.post(f"{_BASE_URL}/complete").mock(
            return_value=Response(200, json=_BODY, headers=_HEADERS)
        )
        sync_client = SyncGateCtr("sync-key", base_url=_BASE_URL)
        result = sync_client.complete("gpt-4o", [{"role": "user", "content": "hi"}])

    assert isinstance(result, CompleteResponse)
    assert result.id == "cmpl_sync"


def test_sync_gatectr_models_delegates():
    """SyncGateCtr.models() delegates to GateCtr and returns ModelsResponse."""
    _BASE_URL = "https://test.gatectr.com/v1"
    _HEADERS = {
        "X-GateCtr-Request-Id": "req_sync_models",
        "X-GateCtr-Latency-Ms": "5",
        "X-GateCtr-Overage": "false",
    }
    _BODY = {
        "models": [
            {
                "model_id": "gpt-4o",
                "display_name": "GPT-4o",
                "provider": "openai",
                "context_window": 128000,
                "capabilities": ["chat"],
            }
        ],
        "request_id": "req_sync_models",
    }

    with respx.mock() as mock:
        mock.get(f"{_BASE_URL}/models").mock(
            return_value=Response(200, json=_BODY, headers=_HEADERS)
        )
        sync_client = SyncGateCtr("sync-key", base_url=_BASE_URL)
        result = sync_client.models()

    assert isinstance(result, ModelsResponse)
    assert result.models[0].model_id == "gpt-4o"
    assert result.request_id == "req_sync_models"
