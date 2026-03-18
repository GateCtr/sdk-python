# POST /v1/chat

Alias for `/v1/complete`. Identical behavior, provided for OpenAI SDK compatibility.

## Endpoint

```
POST https://api.gatectr.com/v1/chat/completions
```

Same request body and response shape as [POST /v1/complete](complete.md).

## When to use

Use `/v1/chat/completions` when pointing an existing OpenAI SDK integration at GateCtr without changing any code:

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.GATECTR_API_KEY,
  baseURL: "https://api.gatectr.com/v1",
});

// This hits /v1/chat/completions — no changes needed
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});
```

GateCtr injects optimization, routing, and budget enforcement transparently.
