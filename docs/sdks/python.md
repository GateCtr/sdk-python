# Python SDK

Full reference for `gatectr-sdk`.

## Install

```bash
pip install gatectr-sdk
# or
uv add gatectr-sdk
```

## Initialize

Your LLM provider keys are connected once in **Settings → Providers** in the dashboard. Your code only needs `GATECTR_API_KEY`.

```python
from gatectr import GateCtr

# Minimal
client = GateCtr(api_key=os.environ["GATECTR_API_KEY"])

# With options
client = GateCtr(
    api_key=os.environ["GATECTR_API_KEY"],
    budget={"max_tokens_per_day": 500_000},  # override project budget
    optimizer={"enabled": True},              # default: True on Pro+
    router={"prefer": "cost"},               # "cost" | "performance" | "balanced"
)
```

## `client.complete()`

```python
response = client.complete(
    model="auto",           # model name or "auto" (Model Router picks)
    messages=[{"role": "user", "content": "Hello"}],
    project_id="my-app",    # optional — for per-project analytics
    user_id="user_123",     # optional — for per-user analytics
    gatectr={
        "optimize": True,   # default: True (Pro+)
        "route": False,     # default: False (Pro+)
        "budget_id": "proj_123",
    }
)

# Response includes GateCtr metadata
print(response.content)
print(response.gatectr)
# → { "tokens_used": 1240, "tokens_saved": 620, "model_used": "gpt-4o-mini", "cost_usd": 0.0014 }
```

## `client.stream()`

```python
for chunk in client.stream(model="gpt-4o", messages=messages):
    print(chunk.delta or "", end="", flush=True)
```

## Async

```python
from gatectr import AsyncGateCtr

client = AsyncGateCtr(api_key=os.environ["GATECTR_API_KEY"])

response = await client.complete(model="gpt-4o", messages=messages)
```

## `client.usage()`

```python
usage = client.usage(
    project_id="proj_123",
    from_date="2025-01-01",
    to_date="2025-01-31",
)
```

## Drop-in for OpenAI SDK

> Your LLM provider keys are stored once in the GateCtr dashboard — AES-encrypted. In your code, you only use `GATECTR_API_KEY`. GateCtr proxies every request to the right provider transparently.

```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["GATECTR_API_KEY"],   # your GateCtr key — not your OpenAI key
    base_url="https://api.gatectr.com/v1",   # GateCtr proxies to OpenAI / Anthropic / Mistral / Gemini
)
```

## Drop-in for LangChain

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    api_key=os.environ["GATECTR_API_KEY"],   # your GateCtr key
    base_url="https://api.gatectr.com/v1",
    model="gpt-4o",
)
```

## Full reference

[github.com/GateCtr/sdk-python](https://github.com/GateCtr/sdk-python)
