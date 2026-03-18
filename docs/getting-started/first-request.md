# Your first request

A closer look at what GateCtr does with each request.

## Request lifecycle

```
Your app
  → GateCtr API
    → Budget Firewall check
    → Context Optimizer (compresses prompt)
    → Model Router (selects model if route: true)
    → LLM provider (OpenAI, Anthropic, Mistral...)
    → Response + analytics logged
  → Your app
```

## Response shape

GateCtr returns an OpenAI-compatible response with an extra `gatectr` field:

```json
{
  "id": "chatcmpl-abc123",
  "model": "gpt-4o",
  "choices": [
    {
      "message": { "role": "assistant", "content": "Hello!" },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 8,
    "total_tokens": 20
  },
  "gatectr": {
    "tokens_saved": 18,
    "original_tokens": 30,
    "model_used": "gpt-4o",
    "optimized": true,
    "cost_usd": 0.00024
  }
}
```

## The `gatectr` field

| Field             | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `tokens_saved`    | Tokens removed by the Context Optimizer              |
| `original_tokens` | Token count before optimization                      |
| `model_used`      | Actual model used (relevant when routing is enabled) |
| `optimized`       | Whether the Context Optimizer ran                    |
| `cost_usd`        | Estimated cost of this request                       |

## Supported models

GateCtr is compatible with any OpenAI-compatible model. Tested providers:

- OpenAI — `gpt-4o`, `gpt-4o-mini`, `gpt-3.5-turbo`
- Anthropic — `claude-3-5-sonnet`, `claude-3-haiku`
- Mistral — `mistral-large`, `mistral-small`
- Gemini — `gemini-1.5-pro`, `gemini-1.5-flash`

Use `model: "auto"` to let the Model Router decide.
