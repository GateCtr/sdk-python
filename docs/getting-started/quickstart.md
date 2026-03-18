# Quickstart

Up and running in 5 min.

## How it works

GateCtr sits between your app and your LLM providers. You store your provider keys (OpenAI, Anthropic, Mistral, Gemini) **once** in the dashboard — AES-encrypted. In your code, you only ever use your `GATECTR_API_KEY`.

```
Your app → GATECTR_API_KEY → GateCtr → your provider key → OpenAI / Anthropic / Mistral / Gemini
```

## 1. Connect your LLM providers

Sign up at [gatectr.com](https://gatectr.com), go to **Settings → Providers**, and add your provider API keys. GateCtr encrypts them at rest — they never appear in your code.

## 2. Get your GateCtr API key

Go to **Settings → API Keys** and create a key. This is the only key you'll use in your code.

## 3. Install the SDK

{% tabs %}
{% tab title="Node.js" %}

```bash
npm install @gatectr/sdk
```

{% endtab %}

{% tab title="Python" %}

```bash
pip install gatectr-sdk
```

{% endtab %}

{% tab title="cURL" %}
No install needed.
{% endtab %}
{% endtabs %}

## 4. Make your first request

{% tabs %}
{% tab title="Node.js" %}

```typescript
import { GateCtr } from "@gatectr/sdk";

const client = new GateCtr({ apiKey: process.env.GATECTR_API_KEY });

const response = await client.complete({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});

console.log(response.choices[0].message.content);
```

{% endtab %}

{% tab title="Python" %}

```python
from gatectr import GateCtr

client = GateCtr(api_key=os.environ["GATECTR_API_KEY"])

response = client.complete(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
)

print(response.choices[0].message.content)
```

{% endtab %}

{% tab title="cURL" %}

```bash
curl https://api.gatectr.com/v1/complete \
  -H "Authorization: Bearer $GATECTR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'
```

{% endtab %}
{% endtabs %}

That's it. GateCtr is now optimizing, routing, and tracking every request.

## What just happened

- Context Optimizer compressed your prompt before sending it to the LLM
- Budget Firewall checked your project limits
- Analytics logged the token usage and cost in your dashboard

## Next steps

- [Set up a Budget Firewall](../features/budget-firewall.md)
- [Enable the Context Optimizer](../features/context-optimizer.md)
- [Configure Webhooks](../features/webhooks.md)
