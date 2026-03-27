from __future__ import annotations

import pytest
import respx
from httpx import Response

from gatectr import GateCtr

# ---------------------------------------------------------------------------
# GateCtr response headers injected on every mock response
# ---------------------------------------------------------------------------

_GATECTR_HEADERS = {
    "X-GateCtr-Request-Id": "req_test123",
    "X-GateCtr-Latency-Ms": "42",
    "X-GateCtr-Overage": "false",
}

_BASE_URL = "https://test.gatectr.com/v1"


# ---------------------------------------------------------------------------
# Mock body helpers — return valid response dicts matching Pydantic models
# ---------------------------------------------------------------------------


def mock_complete_body() -> dict[str, object]:
    """Return a valid /complete response dict matching CompleteResponse shape.

    Note: the ``gatectr`` field is injected by the client from response headers
    and must NOT be included here.
    """
    return {
        "id": "cmpl_test123",
        "object": "text_completion",
        "model": "gpt-4o",
        "choices": [
            {
                "text": "Hello, world!",
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15,
        },
    }


def mock_chat_body() -> dict[str, object]:
    """Return a valid /chat response dict matching ChatResponse shape.

    Note: the ``gatectr`` field is injected by the client from response headers
    and must NOT be included here.
    """
    return {
        "id": "chat_test123",
        "object": "chat.completion",
        "model": "gpt-4o",
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "Hello! How can I help you?",
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 12,
            "completion_tokens": 8,
            "total_tokens": 20,
        },
    }


def mock_models_body() -> dict[str, object]:
    """Return a valid /models response dict matching ModelsResponse shape."""
    return {
        "models": [
            {
                "model_id": "gpt-4o",
                "display_name": "GPT-4o",
                "provider": "openai",
                "context_window": 128000,
                "capabilities": ["chat", "complete"],
            },
            {
                "model_id": "claude-3-5-sonnet",
                "display_name": "Claude 3.5 Sonnet",
                "provider": "anthropic",
                "context_window": 200000,
                "capabilities": ["chat"],
            },
        ],
        "request_id": "req_test123",
    }


def mock_usage_body() -> dict[str, object]:
    """Return a valid /usage response dict matching UsageResponse shape.

    Note: ``from`` is the JSON key (aliased to ``from_`` in Pydantic).
    """
    return {
        "total_tokens": 1000,
        "total_requests": 50,
        "total_cost_usd": 0.025,
        "saved_tokens": 200,
        "from": "2025-01-01T00:00:00Z",
        "to": "2025-01-31T23:59:59Z",
        "by_project": [
            {
                "project_id": "proj_abc",
                "total_tokens": 600,
                "total_requests": 30,
                "total_cost_usd": 0.015,
            },
            {
                "project_id": "proj_xyz",
                "total_tokens": 400,
                "total_requests": 20,
                "total_cost_usd": 0.010,
            },
        ],
    }


def mock_usage_trends_body() -> dict[str, object]:
    return {
        "granularity": "day",
        "from": "2025-01-01",
        "to": "2025-01-07",
        "series": [
            {"date": "2025-01-01", "total_tokens": 10000, "saved_tokens": 2000, "total_requests": 50, "total_cost_usd": 0.3},
            {"date": "2025-01-02", "total_tokens": 12000, "saved_tokens": 2400, "total_requests": 60, "total_cost_usd": 0.36},
        ],
    }


def mock_webhook_body() -> dict[str, object]:
    return {
        "id": "wh_test123",
        "name": "My Webhook",
        "url": "https://example.com/hook",
        "events": ["budget.alert"],
        "is_active": True,
        "last_fired_at": None,
        "fail_count": 0,
        "success_count": 5,
        "created_at": "2025-01-01T00:00:00Z",
    }


def mock_budget_body() -> dict[str, object]:
    return {
        "id": "bgt_test123",
        "user_id": "user_abc",
        "project_id": None,
        "max_tokens_per_day": 100000,
        "max_tokens_per_month": None,
        "max_cost_per_day": None,
        "max_cost_per_month": None,
        "alert_threshold_pct": 80,
        "hard_stop": False,
        "notify_on_threshold": True,
        "notify_on_exceeded": True,
        "created_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-01T00:00:00Z",
    }


def mock_provider_key_body() -> dict[str, object]:
    return {
        "id": "pk_test123",
        "provider": "openai",
        "name": "Default",
        "is_active": True,
        "last_used_at": None,
        "created_at": "2025-01-01T00:00:00Z",
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_api():
    """Fixture that registers respx mock handlers for all GateCtr endpoints."""
    with respx.mock(assert_all_called=False) as mock:
        mock.post(f"{_BASE_URL}/complete").mock(
            return_value=Response(200, json=mock_complete_body(), headers=_GATECTR_HEADERS)
        )
        mock.post(f"{_BASE_URL}/chat").mock(
            return_value=Response(200, json=mock_chat_body(), headers=_GATECTR_HEADERS)
        )
        mock.get(f"{_BASE_URL}/models").mock(
            return_value=Response(200, json=mock_models_body(), headers=_GATECTR_HEADERS)
        )
        mock.get(f"{_BASE_URL}/usage").mock(
            return_value=Response(200, json=mock_usage_body(), headers=_GATECTR_HEADERS)
        )
        mock.get(f"{_BASE_URL}/usage/trends").mock(
            return_value=Response(200, json=mock_usage_trends_body(), headers=_GATECTR_HEADERS)
        )
        mock.get(f"{_BASE_URL}/webhooks").mock(
            return_value=Response(200, json={"webhooks": [mock_webhook_body()]}, headers=_GATECTR_HEADERS)
        )
        mock.post(f"{_BASE_URL}/webhooks").mock(
            return_value=Response(201, json=mock_webhook_body(), headers=_GATECTR_HEADERS)
        )
        mock.patch(f"{_BASE_URL}/webhooks/wh_test123").mock(
            return_value=Response(200, json={**mock_webhook_body(), "name": "Updated"}, headers=_GATECTR_HEADERS)
        )
        mock.delete(f"{_BASE_URL}/webhooks/wh_test123").mock(
            return_value=Response(204)
        )
        mock.get(f"{_BASE_URL}/budget").mock(
            return_value=Response(200, json={"user_budget": mock_budget_body(), "project_budgets": []}, headers=_GATECTR_HEADERS)
        )
        mock.post(f"{_BASE_URL}/budget").mock(
            return_value=Response(200, json=mock_budget_body(), headers=_GATECTR_HEADERS)
        )
        mock.get(f"{_BASE_URL}/provider-keys").mock(
            return_value=Response(200, json=[mock_provider_key_body()], headers=_GATECTR_HEADERS)
        )
        mock.post(f"{_BASE_URL}/provider-keys").mock(
            return_value=Response(201, json=mock_provider_key_body(), headers=_GATECTR_HEADERS)
        )
        mock.delete(f"{_BASE_URL}/provider-keys/pk_test123").mock(
            return_value=Response(200, json={"success": True})
        )
        yield mock


@pytest.fixture
async def client():
    """Fixture that yields a GateCtr instance pointed at the test base URL.

    Calls ``aclose()`` after the test to clean up the underlying httpx client.
    """
    gc = GateCtr("test-api-key", base_url=_BASE_URL)
    try:
        yield gc
    finally:
        await gc.aclose()
