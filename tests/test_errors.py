"""Unit tests for gatectr error classes.

Validates: Requirements 9.1, 9.6, 13.3
"""
from __future__ import annotations

import pytest

from gatectr import (
    GateCtrApiError,
    GateCtrConfigError,
    GateCtrError,
    GateCtrNetworkError,
    GateCtrStreamError,
    GateCtrTimeoutError,
)

# ---------------------------------------------------------------------------
# Exception hierarchy
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "cls",
    [
        GateCtrConfigError,
        GateCtrApiError,
        GateCtrTimeoutError,
        GateCtrStreamError,
        GateCtrNetworkError,
    ],
)
def test_all_errors_are_instances_of_base(cls) -> None:
    """All 5 error classes are isinstance of GateCtrError (and therefore Exception)."""
    if cls is GateCtrApiError:
        err = cls("msg", status=400, code="bad_request")
    elif cls is GateCtrTimeoutError:
        err = cls(10.0)
    elif cls in (GateCtrStreamError, GateCtrNetworkError):
        err = cls("msg")
    else:
        err = cls("msg")

    assert isinstance(err, GateCtrError)
    assert isinstance(err, Exception)


# ---------------------------------------------------------------------------
# GateCtrApiError
# ---------------------------------------------------------------------------


def _make_api_error(**kwargs) -> GateCtrApiError:
    defaults = {"status": 422, "code": "validation_error", "request_id": "req_abc"}
    return GateCtrApiError("Something went wrong", **{**defaults, **kwargs})


def test_api_error_stores_attributes() -> None:
    """GateCtrApiError stores status, code, and request_id as attributes."""
    err = _make_api_error(status=404, code="not_found", request_id="req_xyz")
    assert err.status == 404
    assert err.code == "not_found"
    assert err.request_id == "req_xyz"


def test_api_error_to_dict_exact_keys() -> None:
    """to_dict() returns exactly the keys {name, message, status, code, request_id}."""
    err = _make_api_error()
    result = err.to_dict()
    assert set(result.keys()) == {"name", "message", "status", "code", "request_id"}


def test_api_error_to_dict_no_api_key() -> None:
    """to_dict() must never include an api_key key."""
    err = _make_api_error()
    assert "api_key" not in err.to_dict()


def test_api_error_to_dict_name_is_class_name() -> None:
    """to_dict()['name'] equals 'GateCtrApiError'."""
    err = _make_api_error()
    assert err.to_dict()["name"] == "GateCtrApiError"


def test_api_error_to_dict_values() -> None:
    """to_dict() values match the constructor arguments."""
    err = GateCtrApiError("oops", status=500, code="server_error", request_id="req_1")
    d = err.to_dict()
    assert d["message"] == "oops"
    assert d["status"] == 500
    assert d["code"] == "server_error"
    assert d["request_id"] == "req_1"


def test_api_error_request_id_optional() -> None:
    """request_id defaults to None when not provided."""
    err = GateCtrApiError("err", status=400, code="bad_request")
    assert err.request_id is None
    assert err.to_dict()["request_id"] is None


# ---------------------------------------------------------------------------
# GateCtrTimeoutError
# ---------------------------------------------------------------------------


def test_timeout_error_message_contains_timeout_value() -> None:
    """GateCtrTimeoutError message includes the configured timeout value."""
    err = GateCtrTimeoutError(15.0)
    assert "15.0" in str(err)


def test_timeout_error_stores_timeout_s() -> None:
    """GateCtrTimeoutError stores the timeout value as timeout_s."""
    err = GateCtrTimeoutError(30.5)
    assert err.timeout_s == 30.5


# ---------------------------------------------------------------------------
# GateCtrStreamError and GateCtrNetworkError — __cause__ chaining
# ---------------------------------------------------------------------------


def test_stream_error_chains_cause() -> None:
    """GateCtrStreamError sets __cause__ to the provided exception."""
    cause = ConnectionResetError("reset")
    err = GateCtrStreamError("stream broke", cause=cause)
    assert err.__cause__ is cause


def test_stream_error_no_cause() -> None:
    """GateCtrStreamError works without a cause (defaults to None)."""
    err = GateCtrStreamError("stream broke")
    assert err.__cause__ is None


def test_network_error_chains_cause() -> None:
    """GateCtrNetworkError sets __cause__ to the provided exception."""
    cause = OSError("connection refused")
    err = GateCtrNetworkError("network failure", cause=cause)
    assert err.__cause__ is cause


def test_network_error_no_cause() -> None:
    """GateCtrNetworkError works without a cause (defaults to None)."""
    err = GateCtrNetworkError("network failure")
    assert err.__cause__ is None
