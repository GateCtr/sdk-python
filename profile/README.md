<div align="center">

<img src="logo.svg" width="72" height="72" alt="GateCtr" />

# GateCtr

**One gateway. Every LLM.**

[![npm](https://img.shields.io/npm/v/@gatectr/sdk?color=1B4F82&label=npm)](https://www.npmjs.com/package/@gatectr/sdk)
[![license](https://img.shields.io/badge/license-MIT-00B4C8)](LICENSE)
[![status](https://img.shields.io/badge/status-operational-38A169)](https://status.gatectr.com)

```bash
npm install @gatectr/sdk
```

```typescript
import { GateCtr } from "@gatectr/sdk";
const client = new GateCtr({ apiKey: "your-key" });
const res = await client.complete({ model: "gpt-4o", messages });
```

[Docs](https://docs.gatectr.com) · [Dashboard](https://gatectr.com) · [Status](https://status.gatectr.com) · [X](https://x.com/gatectrl)

</div>

---

- **Budget Firewall** — Hard caps per project. No surprise invoices.
- **Context Optimizer** — -40% tokens. Same output quality.
- **Model Router** — Auto-selects the right LLM. You pay less.
- **Analytics** — Every token. Every cost. Real-time.
- **Webhooks** — Push events to Slack, Teams, or any URL.
- **RBAC** — Admin, Manager, Dev, Viewer. Your team, your rules.
