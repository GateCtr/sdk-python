<div align="center">

<img src="https://raw.githubusercontent.com/GateCtr/.github/main/profile/logo.svg" width="56" height="56" alt="GateCtr" />

# GateCtr Examples

**Integration examples for every stack.**

[![status](https://img.shields.io/badge/status-operational-38A169)](https://status.gatectr.com)
[![license](https://img.shields.io/badge/license-MIT-00B4C8)](LICENSE)

</div>

---

## Examples

| Example                                | Stack                   | What it shows                                      |
| -------------------------------------- | ----------------------- | -------------------------------------------------- |
| [`node-sdk`](./node-sdk)               | Node.js + TypeScript    | All 11 SDK methods — complete, chat, stream, usage, models, errors, optimizer, router |
| [`nextjs-app`](./nextjs-app)           | Next.js 15 + App Router | API route with GateCtr, budget firewall, streaming |
| [`langchain-agent`](./langchain-agent) | Python + LangChain      | Agent with token cap and auto-fallback to Mistral  |
| [`fastapi-service`](./fastapi-service) | Python + FastAPI        | Async completions with budget per endpoint         |
| [`express-proxy`](./express-proxy)     | Node.js + Express       | Drop-in proxy for existing OpenAI calls            |
| [`budget-alert`](./budget-alert)       | Node.js                 | Webhook to Slack when budget threshold is hit      |

---

## Prerequisites

- A GateCtr account — [sign up free](https://gatectr.com)
- Your GateCtr API key from the dashboard

---

## Next.js

```bash
cd nextjs-app
pnpm install
cp .env.example .env.local  # add your GATECTR_API_KEY
pnpm dev
```

```typescript
// app/api/chat/route.ts
import { GateCtr } from "@gatectr/sdk";

const client = new GateCtr({ apiKey: process.env.GATECTR_API_KEY });

export async function POST(req: Request) {
  const { messages } = await req.json();

  const response = await client.complete({ model: "gpt-4o", messages });

  return Response.json(response.choices[0].message);
}
```

---

## LangChain agent

```bash
cd langchain-agent
pip install -r requirements.txt
cp .env.example .env  # add your GATECTR_API_KEY
python agent.py
```

```python
# agent.py
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor

llm = ChatOpenAI(
    api_key=os.environ["GATECTR_API_KEY"],
    base_url="https://api.gatectr.com/v1",
    model="gpt-4o",
)

# GateCtr caps token usage automatically — no runaway agent loops
```

---

## FastAPI service

```bash
cd fastapi-service
uv run uvicorn main:app --reload
```

```python
# main.py
from fastapi import FastAPI
from gatectr import AsyncGateCtr

app = FastAPI()
client = AsyncGateCtr(api_key=os.environ["GATECTR_API_KEY"])

@app.post("/summarize")
async def summarize(text: str):
    response = await client.complete(
        model="gpt-4o",
        messages=[{"role": "user", "content": f"Summarize: {text}"}],
    )
    return {"summary": response.choices[0].message.content}
```

---

## Budget alert webhook

```typescript
// budget-alert/index.ts
// Receives GateCtr webhook events and forwards to Slack

export async function POST(req: Request) {
  const event = await req.json();

  if (event.type === "budget.threshold_reached") {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: "POST",
      body: JSON.stringify({
        text: `Budget alert: ${event.project} reached ${event.percent}% of limit.`,
      }),
    });
  }

  return Response.json({ ok: true });
}
```

---

## Links

[Dashboard](https://gatectr.com) · [Docs](https://docs.gatectr.com) · [Node SDK](https://github.com/GateCtr/sdk-node) · [Python SDK](https://github.com/GateCtr/sdk-python)
