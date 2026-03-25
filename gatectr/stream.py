from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from .errors import GateCtrStreamError
from .types import StreamChunk


async def parse_sse(response: httpx.Response) -> AsyncIterator[StreamChunk]:
    """
    Parse a server-sent events response into StreamChunk objects.

    Reads the response body line by line, parses `data: {...}` lines as JSON,
    yields StreamChunk for each non-[DONE] event, and stops cleanly on
    `data: [DONE]`. Raises GateCtrStreamError on any mid-stream failure.
    """
    try:
        async for line in response.aiter_lines():
            line = line.strip()
            if not line or not line.startswith("data:"):
                continue
            payload = line[len("data:") :].strip()
            if payload == "[DONE]":
                return
            try:
                data = json.loads(payload)
            except json.JSONDecodeError as exc:
                raise GateCtrStreamError(
                    f"Failed to parse SSE payload: {payload!r}", cause=exc
                ) from exc

            choices = data.get("choices", [])
            first = choices[0] if choices else {}
            delta_obj = first.get("delta", {})
            yield StreamChunk(
                id=data.get("id", ""),
                delta=delta_obj.get("content"),
                finish_reason=first.get("finish_reason"),
            )
    except GateCtrStreamError:
        raise
    except Exception as exc:
        raise GateCtrStreamError(f"Stream error: {exc}", cause=exc) from exc
    finally:
        await response.aclose()
