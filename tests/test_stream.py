"""Unit tests for gatectr.stream — SSE parsing, error handling, and cleanup.

Validates: Requirements 5.2, 5.3, 5.4, 5.5, 13.3
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from gatectr import GateCtrStreamError, StreamChunk
from gatectr.stream import parse_sse

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_mock_response(lines: list[str]) -> MagicMock:
    """Build a fake httpx.Response that yields the given lines from aiter_lines()."""

    async def _aiter():
        for line in lines:
            yield line

    response = MagicMock()
    response.aiter_lines = _aiter
    response.aclose = AsyncMock()
    return response


async def collect(response: MagicMock) -> list[StreamChunk]:
    """Consume parse_sse() into a list."""
    chunks: list[StreamChunk] = []
    async for chunk in parse_sse(response):
        chunks.append(chunk)
    return chunks


# ---------------------------------------------------------------------------
# 13.1 — SSE parsing happy path
# ---------------------------------------------------------------------------


async def test_valid_data_lines_yield_correct_chunks() -> None:
    """Valid data: lines produce StreamChunk objects with correct delta, finish_reason, and id."""
    lines = [
        'data: {"id": "chunk1", "choices": [{"delta": {"content": "Hello"}, "finish_reason": null}]}',
        'data: {"id": "chunk2", "choices": [{"delta": {"content": " world"}, "finish_reason": "stop"}]}',
        "data: [DONE]",
    ]
    response = make_mock_response(lines)
    chunks = await collect(response)

    assert len(chunks) == 2

    assert chunks[0].id == "chunk1"
    assert chunks[0].delta == "Hello"
    assert chunks[0].finish_reason is None

    assert chunks[1].id == "chunk2"
    assert chunks[1].delta == " world"
    assert chunks[1].finish_reason == "stop"


async def test_done_sentinel_closes_iterator_cleanly() -> None:
    """data: [DONE] stops iteration without raising any exception."""
    lines = [
        'data: {"id": "c1", "choices": [{"delta": {"content": "hi"}, "finish_reason": null}]}',
        "data: [DONE]",
        # Lines after [DONE] must never be yielded
        'data: {"id": "c2", "choices": [{"delta": {"content": "ignored"}, "finish_reason": null}]}',
    ]
    response = make_mock_response(lines)
    chunks = await collect(response)

    assert len(chunks) == 1
    assert chunks[0].id == "c1"


async def test_blank_lines_are_skipped() -> None:
    """Blank lines between SSE events are silently ignored."""
    lines = [
        "",
        'data: {"id": "c1", "choices": [{"delta": {"content": "A"}, "finish_reason": null}]}',
        "",
        "data: [DONE]",
    ]
    response = make_mock_response(lines)
    chunks = await collect(response)

    assert len(chunks) == 1
    assert chunks[0].delta == "A"


async def test_non_data_lines_are_skipped() -> None:
    """Lines that don't start with 'data:' (e.g. event:, comments) are silently ignored."""
    lines = [
        "event: ping",
        ": this is a comment",
        "retry: 3000",
        'data: {"id": "c1", "choices": [{"delta": {"content": "B"}, "finish_reason": "stop"}]}',
        "data: [DONE]",
    ]
    response = make_mock_response(lines)
    chunks = await collect(response)

    assert len(chunks) == 1
    assert chunks[0].id == "c1"
    assert chunks[0].delta == "B"


async def test_empty_stream_yields_no_chunks() -> None:
    """A stream with only [DONE] yields no chunks."""
    response = make_mock_response(["data: [DONE]"])
    chunks = await collect(response)
    assert chunks == []


# ---------------------------------------------------------------------------
# 13.2 — Error and cleanup tests
# ---------------------------------------------------------------------------


async def test_mid_stream_json_error_raises_stream_error() -> None:
    """A malformed JSON payload mid-stream raises GateCtrStreamError."""
    lines = [
        'data: {"id": "c1", "choices": [{"delta": {"content": "ok"}, "finish_reason": null}]}',
        "data: {not valid json}",
    ]
    response = make_mock_response(lines)

    with pytest.raises(GateCtrStreamError) as exc_info:
        await collect(response)

    assert "Failed to parse SSE payload" in str(exc_info.value)


async def test_aclose_called_on_success() -> None:
    """response.aclose() is called after a successful stream."""
    lines = [
        'data: {"id": "c1", "choices": [{"delta": {"content": "hi"}, "finish_reason": "stop"}]}',
        "data: [DONE]",
    ]
    response = make_mock_response(lines)
    await collect(response)

    response.aclose.assert_awaited_once()


async def test_aclose_called_on_json_error() -> None:
    """response.aclose() is called even when a JSON parse error occurs mid-stream."""
    lines = [
        "data: {bad json}",
    ]
    response = make_mock_response(lines)

    with pytest.raises(GateCtrStreamError):
        await collect(response)

    response.aclose.assert_awaited_once()


async def test_aclose_called_on_cancellation() -> None:
    """response.aclose() is called when the consumer explicitly closes the generator early."""

    async def _aiter():
        yield 'data: {"id": "c1", "choices": [{"delta": {"content": "A"}, "finish_reason": null}]}'
        yield 'data: {"id": "c2", "choices": [{"delta": {"content": "B"}, "finish_reason": null}]}'
        yield "data: [DONE]"

    response = MagicMock()
    response.aiter_lines = _aiter
    response.aclose = AsyncMock()

    # Explicitly close the generator — simulates cancellation / early teardown
    gen = parse_sse(response)
    await gen.__anext__()  # consume first chunk
    await gen.aclose()     # force generator cleanup, triggering finally block

    response.aclose.assert_awaited_once()
