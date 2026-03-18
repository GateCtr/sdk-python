<div align="center">

<img src="https://raw.githubusercontent.com/GateCtr/.github/main/profile/logo.svg" width="56" height="56" alt="GateCtr" />

# gatectr-sdk

**Python SDK for GateCtr — One gateway. Every LLM.**

[![PyPI](https://img.shields.io/pypi/v/gatectr-sdk?color=1B4F82)](https://pypi.org/project/gatectr-sdk)
[![license](https://img.shields.io/badge/license-MIT-00B4C8)](LICENSE)
[![python](https://img.shields.io/badge/python-3.9+-00B4C8)](https://pypi.org/project/gatectr-sdk)
[![status](https://img.shields.io/badge/status-operational-38A169)](https://status.gatectr.com)

</div>

---

## Install

```bash
pip install gatectr-sdk
# or
uv add gatectr-sdk
```

## Quick start

```python
from gatectr import GateCtr

client = GateCtr(api_key="your-api-key")

response = client.complete(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
)

print(response.choices[0].message.content)
```

One endpoint swap. Your existing OpenAI-compatible code works as-is.

---

## What GateCtr adds automatically

- **-40% tokens** — Context Optimizer compresses prompts before they hit the LLM
- **Budget Firewall** — Hard caps per project. Requests blocked when limit is reached.
- **Model Router** — Optionally let GateCtr pick the right model for each request
- **Analytics** — Every token, every cost tracked in your dashboard
- **Webhooks** — Budget alerts pushed to Slack, Teams, or any URL

---

## Usage

### Chat completion

```python
response = client.complete(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Summarize this document."},
    ],
)
```

### Async

```python
import asyncio
from gatectr import AsyncGateCtr

client = AsyncGateCtr(api_key="your-api-key")

async def main():
    response = await client.complete(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}],
    )
    print(response.choices[0].message.content)

asyncio.run(main())
```

### Streaming

```python
for chunk in client.stream(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
):
    print(chunk.delta or "", end="", flush=True)
```

### With budget override

```python
response = client.complete(
    model="gpt-4o",
    messages=messages,
    gatectr={
        "budget_id": "proj_123",  # enforce a specific budget
        "optimize": True,          # enable context optimizer
        "route": False,            # disable model router for this call
    },
)
```

### Model Router (auto-select)

```python
response = client.complete(
    model="auto",  # GateCtr picks the optimal model
    messages=messages,
)

print(response.gatectr.model_used)    # e.g. "gpt-3.5-turbo"
print(response.gatectr.tokens_saved)  # e.g. 312
```

---

## Configuration

```python
client = GateCtr(
    api_key="your-api-key",                      # required
    base_url="https://api.gatectr.com/v1",       # default
    timeout=30.0,                                 # seconds
    optimize=True,                                # context optimizer
    route=False,                                  # model router
)
```

| Option     | Type    | Default                      | Description                |
| ---------- | ------- | ---------------------------- | -------------------------- |
| `api_key`  | `str`   | —                            | Your GateCtr API key       |
| `base_url` | `str`   | `https://api.gatectr.com/v1` | API base URL               |
| `timeout`  | `float` | `30.0`                       | Request timeout in seconds |
| `optimize` | `bool`  | `True`                       | Enable context optimizer   |
| `route`    | `bool`  | `False`                      | Enable model router        |

---

## Drop-in for OpenAI SDK

Already using the OpenAI Python SDK? Swap the base URL:

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-gatectr-api-key",
    base_url="https://api.gatectr.com/v1",
)

# Everything else stays the same
```

## Drop-in for LangChain

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    api_key="your-gatectr-api-key",
    base_url="https://api.gatectr.com/v1",
    model="gpt-4o",
)
```

---

## Requirements

- Python 3.9+

---

## Links

[Dashboard](https://gatectr.com) · [Docs](https://docs.gatectr.com) · [Status](https://status.gatectr.com) · [X](https://x.com/gatectrl)
