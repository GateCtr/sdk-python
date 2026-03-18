# Node.js SDK

Full reference for `@gatectr/sdk`.

## Install

```bash
npm install @gatectr/sdk
```

## Initialize

Your LLM provider keys (OpenAI, Anthropic, etc.) are connected once in **Settings → Providers** in the dashboard. Your code only needs `GATECTR_API_KEY`.

```typescript
import { GateCtr } from "@gatectr/sdk";

// Minimal
const client = new GateCtr({
  apiKey: process.env.GATECTR_API_KEY,
});

// With options
const client = new GateCtr({
  apiKey: process.env.GATECTR_API_KEY,
  budget: { maxTokensPerDay: 500_000 }, // override project budget
  optimizer: { enabled: true }, // default: true on Pro+
  router: { prefer: "cost" }, // 'cost' | 'performance' | 'balanced'
});
```

## `client.complete()`

```typescript
const response = await client.complete({
  model: 'gpt-4o',         // model name or "auto" (Model Router picks)
  messages: [{ role: 'user', content: 'Hello' }],
  projectId: 'my-app',     // optional — for per-project analytics
  userId: 'user_123',      // optional — for per-user analytics
  gatectr?: {
    optimize?: boolean,    // default: true (Pro+)
    route?: boolean,       // default: false (Pro+)
    budget_id?: string,    // override project budget
  }
});

// Response includes GateCtr metadata
console.log(response.content);
console.log(response.gatectr);
// → { tokens_used: 1240, tokens_saved: 620, model_used: 'gpt-4o-mini', cost_usd: 0.0014 }
```

## `client.stream()`

```typescript
const stream = await client.stream({
  model: "gpt-4o",
  messages,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.delta ?? "");
}
```

## `client.usage()`

```typescript
const usage = await client.usage({
  projectId: "proj_123",
  from: "2025-01-01",
  to: "2025-01-31",
});
```

## Drop-in for OpenAI SDK

> Your LLM provider keys (OpenAI, Anthropic, etc.) are stored once in the GateCtr dashboard — AES-encrypted. In your code, you only use your `GATECTR_API_KEY`. GateCtr proxies every request to the right provider transparently.

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.GATECTR_API_KEY, // your GateCtr key — not your OpenAI key
  baseURL: "https://api.gatectr.com/v1", // GateCtr proxies to OpenAI / Anthropic / Mistral / Gemini
});
```

## Full reference

[github.com/GateCtr/sdk-node](https://github.com/GateCtr/sdk-node)
