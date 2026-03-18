# Model Router

GateCtr picks the right LLM for each request. You pay less.

## How it works

When routing is enabled, GateCtr scores each request against a set of criteria and selects the optimal model:

- Task complexity (simple Q&A vs. multi-step reasoning)
- Required output quality
- Current model pricing
- Your configured provider preferences

Simple requests go to cheaper models. Complex ones go to the best model for the job.

## Enable

```typescript
const response = await client.complete({
  model: "auto", // triggers the Model Router
  messages,
});

console.log(response.gatectr.model_used); // e.g. "gpt-3.5-turbo"
```

Or enable globally:

```typescript
const client = new GateCtr({
  apiKey: process.env.GATECTR_API_KEY,
  route: true,
});
```

## Routing logic

| Request type                  | Typical selection                |
| ----------------------------- | -------------------------------- |
| Simple Q&A, short tasks       | `gpt-3.5-turbo`, `mistral-small` |
| Summarization, classification | `gpt-4o-mini`, `claude-3-haiku`  |
| Complex reasoning, code       | `gpt-4o`, `claude-3-5-sonnet`    |

## Configure provider preferences

In the dashboard: **Settings → Model Router**

You can restrict routing to specific providers or exclude models entirely.

## Response fields

```json
"gatectr": {
  "model_used": "gpt-3.5-turbo",
  "model_requested": "auto",
  "routing_reason": "low_complexity",
  "cost_usd": 0.00008
}
```

## Available on

Pro plan and above.
