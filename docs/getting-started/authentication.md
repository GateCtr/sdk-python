# Authentication

GateCtr uses two types of keys — keep them separate.

## Your GateCtr API key

This is the key you use in your code. It identifies your account and authorizes requests to GateCtr.

### Get your key

1. Sign in at [gatectr.com](https://gatectr.com)
2. Go to **Settings → API Keys**
3. Click **Create key**
4. Copy and store it securely — it won't be shown again

### Use it in your code

```bash
Authorization: Bearer gct_live_xxxxxxxxxxxx
```

Or via the SDK:

{% tabs %}
{% tab title="Node.js" %}

```typescript
const client = new GateCtr({ apiKey: process.env.GATECTR_API_KEY });
```

{% endtab %}

{% tab title="Python" %}

```python
client = GateCtr(api_key=os.environ["GATECTR_API_KEY"])
```

{% endtab %}
{% endtabs %}

## Your LLM provider keys

Your OpenAI, Anthropic, Mistral, and Gemini keys are stored **in the dashboard only** — never in your code.

### Connect your providers

1. Go to **Settings → Providers**
2. Add your provider API keys (OpenAI, Anthropic, Mistral, Gemini)
3. GateCtr encrypts them with AES-256 at rest

### How GateCtr uses them

Every request you send with your `GATECTR_API_KEY` is proxied to the right provider using your stored key — decrypted in memory, never logged, never exposed.

```
Your app
  → GATECTR_API_KEY (in your code)
  → GateCtr decrypts your provider key
  → Forwards to OpenAI / Anthropic / Mistral / Gemini
  → Returns response to your app
```

## Key format

| Prefix      | Environment              |
| ----------- | ------------------------ |
| `gct_live_` | Production               |
| `gct_test_` | Test (no real LLM calls) |

## Security

- Never commit API keys to source control
- Use environment variables: `GATECTR_API_KEY`
- Rotate keys in **Settings → API Keys** if compromised
- Your LLM provider keys are AES-256 encrypted at rest — GateCtr never exposes them
