# POST /v1/complete

Send a completion request through GateCtr.

## Endpoint

```
POST https://api.gatectr.com/v1/complete
```

## Headers

| Header          | Value                   |
| --------------- | ----------------------- |
| `Authorization` | `Bearer <your-api-key>` |
| `Content-Type`  | `application/json`      |

## Request body

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello" }
  ],
  "temperature": 0.7,
  "max_tokens": 1024,
  "stream": false,
  "gatectr": {
    "optimize": true,
    "route": false,
    "budget_id": "proj_123"
  }
}
```

### Parameters

| Field               | Type      | Required | Description                                |
| ------------------- | --------- | -------- | ------------------------------------------ |
| `model`             | `string`  | Yes      | Model name or `"auto"` for Model Router    |
| `messages`          | `array`   | Yes      | OpenAI-compatible messages array           |
| `temperature`       | `number`  | No       | Sampling temperature (0–2)                 |
| `max_tokens`        | `number`  | No       | Max completion tokens                      |
| `stream`            | `boolean` | No       | Enable streaming (default: `false`)        |
| `gatectr.optimize`  | `boolean` | No       | Enable Context Optimizer (default: `true`) |
| `gatectr.route`     | `boolean` | No       | Enable Model Router (default: `false`)     |
| `gatectr.budget_id` | `string`  | No       | Override project budget                    |

## Response

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 9,
    "total_tokens": 21
  },
  "gatectr": {
    "optimized": true,
    "original_tokens": 20,
    "tokens_saved": 8,
    "model_used": "gpt-4o",
    "cost_usd": 0.00021
  }
}
```

## Error responses

| Status | Type               | Description                    |
| ------ | ------------------ | ------------------------------ |
| `401`  | `unauthorized`     | Invalid or missing API key     |
| `429`  | `budget_exceeded`  | Project budget limit reached   |
| `422`  | `validation_error` | Invalid request body           |
| `502`  | `provider_error`   | LLM provider returned an error |
