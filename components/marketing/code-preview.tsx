"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { Link } from "@/i18n/routing";
import { PRODUCT } from "@/config/product";
import { CodeSnippet } from "@/components/ui/code-snippet";

export function CodePreview() {
  const t = useTranslations("home.codePreview");

  const tabs = [
    {
      label: "Node.js",
      language: "ts" as const,
      highlightLines: [1, 3],
      code: `import { GateCtr } from '${PRODUCT.sdk.npm}';

const client = new GateCtr({ apiKey: process.env.GATECTR_API_KEY });

const response = await client.complete({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});

console.log(response.choices[0].message.content);`,
      callout: t("calloutNode", { sdkNpm: PRODUCT.sdk.npm }),
      calloutVariant: "success" as const,
    },
    {
      label: "Python",
      language: "python" as const,
      highlightLines: [1, 3],
      code: `from gatectr import GateCtr

client = GateCtr(api_key=os.environ["GATECTR_API_KEY"])

response = client.complete(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
)

print(response.choices[0].message.content)`,
      callout: t("calloutPython", { sdkPip: PRODUCT.sdk.pip }),
      calloutVariant: "success" as const,
    },
    {
      label: "cURL",
      language: "bash" as const,
      highlightLines: [1],
      code: `curl ${PRODUCT.api.baseUrl}/complete \\
  -H "Authorization: Bearer $GATECTR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'`,
      callout: t("calloutCurl"),
      calloutVariant: "info" as const,
    },
    {
      label: "Drop-in",
      language: "ts" as const,
      highlightLines: [4, 5],
      code: `import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.GATECTR_API_KEY,   // your GateCtr key — LLM providers connected in dashboard
  baseURL: '${PRODUCT.api.baseUrl}',     // GateCtr proxies to OpenAI / Anthropic / Mistral / Gemini
});`,
      callout: t("calloutDropin"),
      calloutVariant: "success" as const,
    },
    {
      label: "Advanced",
      language: "python" as const,
      highlightLines: [4, 5, 6],
      code: `from gatectr import GateCtr

client = GateCtr(
    api_key=os.environ["GATECTR_API_KEY"],
    budget={"max_tokens_per_day": 500_000},  # hard cap — blocks when reached
    optimizer={"enabled": True},              # -40% tokens automatically
    router={"prefer": "cost"},               # "cost" | "performance" | "balanced"
)

result = client.complete(
    model="auto",                            # Model Router picks the best fit
    messages=[{"role": "user", "content": "..."}],
    project_id="my-app",
    user_id="user_123",
)

# result.gatectr → tokens_used, tokens_saved, model_used, cost_usd`,
      callout: t("calloutAdvanced"),
      calloutVariant: "info" as const,
    },
  ];

  return (
    <section className="py-20 px-4 bg-muted/20">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-3">
            {t("label")}
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t("headline")}
          </h2>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>

        <CodeSnippet tabs={tabs} showLineNumbers chrome allowWrap />

        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <Button variant="cta-code" size="default">
            <Copy className="size-3" />
            {t("ctaCode", { sdkNpm: PRODUCT.sdk.npm })}
          </Button>
          <Button variant="cta-ghost" size="default" asChild>
            <Link href="/docs">{t("ctaDocs")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
