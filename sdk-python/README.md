# gatectr-sdk

The official Python SDK for [GateCtr](https://gatectr.com) — the intelligent LLM gateway.

One endpoint swap. Full control. -40% tokens.

## Installation

```bash
pip install gatectr-sdk
```

Requires Python 3.9+.

## Quickstart

### Async (recommended)

```python
import asyncio
from gatectr import GateCtr

async def main():
    client = GateCtr(api_key="gct_your_api_key")

    # Text completion
    response = await client.complete(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello, world!"}],
    )
    print(response.choices[0].text)
    print(f"Tokens saved: {response.gatectr.tokens_saved}")

    # Chat completion
    chat = await client.chat(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is GateCtr?"},
        ],
    )
    print(chat.choices[0].message.content)

    # Streaming
    async for chunk in client.stream(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Tell me a story."}],
    ):
        if chunk.delta:
            print(chunk.delta, end="", flush=True)

    await client.aclose()

asyncio.run(main())
```

### Async context manager

```python
from gatectr import GateCtr

async with GateCtr(api_key="gct_your_api_key") as client:
    response = await client.complete(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello!"}],
    )
    print(response.choices[0].text)
```

### Sync wrapper

```python
from gatectr import SyncGateCtr

client = SyncGateCtr(api_key="gct_your_api_key")

response = client.complete(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].text)
```

### Environment variable

Set `GATECTR_API_KEY` and omit the `api_key` argument:

```bash
export GATECTR_API_KEY=gct_your_api_key
```

```python
from gatectr import GateCtr

client = GateCtr()  # reads from GATECTR_API_KEY
```

## Configuration

```python
client = GateCtr(
    api_key="gct_your_api_key",
    base_url="https://api.gatectr.com/v1",  # default
    timeout=30.0,                            # seconds, default 30
    max_retries=3,                           # default 3
    optimize=True,                           # Context Optimizer, default True
    route=False,                             # Model Router, default False
)
```

## Error handling

```python
from gatectr import GateCtr, GateCtrApiError, GateCtrTimeoutError

async with GateCtr() as client:
    try:
        response = await client.complete(model="gpt-4o", messages=[...])
    except GateCtrApiError as e:
        print(f"API error {e.status}: {e.code}")
    except GateCtrTimeoutError as e:
        print(f"Timed out: {e}")
```

## License

MIT — see [LICENSE](LICENSE).
