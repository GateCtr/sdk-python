import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSeoContext, buildCanonicalUrl } from "@/lib/seo";
import { WebPageJsonLd } from "@/components/seo/json-ld";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "changelog.metadata" });
  const context = await getSeoContext();
  const canonical = buildCanonicalUrl("/changelog", locale, context);

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical },
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      url: canonical,
    },
    twitter: {
      title: t("ogTitle"),
      description: t("ogDescription"),
    },
  };
}

const RELEASES = [
  {
    version: "v0.3.0",
    date: "2026-03-21",
    added: [
      "LLM Gateway — one endpoint for OpenAI, Anthropic, Mistral, and Gemini. One URL swap, zero code changes.",
      "Budget Firewall — hard caps and soft alerts per project. No surprise invoices.",
      "Context Optimizer — automatic prompt compression. Up to -40% tokens, same output quality.",
      "Model Router — automatic model selection based on cost and performance per request.",
      "Rate limiting — per API key, per project, and per plan.",
      "API key management — create, list, and revoke keys with scoped access.",
      "LLM provider key vault — store your OpenAI, Anthropic, Mistral, and Gemini keys. Encrypted at rest.",
      "Model catalog — browse all active models with capabilities and pricing.",
      "Usage API — token usage and cost aggregated by model and project.",
      "Budget API — configure monthly token and cost limits with alert thresholds.",
    ],
  },
  {
    version: "v0.2.0",
    date: "2026-03-20",
    added: [
      "Billing — Free, Pro, Team, and Enterprise plans via Stripe.",
      "Self-serve subscription management and cancellation.",
      "Webhooks engine — push budget alerts and usage events to Slack, Teams, or any URL.",
      "Audit logs — 90-day retention for Team and Enterprise plans.",
      "RBAC — Admin, Manager, Dev, and Viewer roles for team workspaces.",
      "Upsell prompts — contextual upgrade suggestions triggered by plan limits.",
      "Transactional emails — subscription confirmation, payment failed, cancellation.",
    ],
  },
  {
    version: "v0.1.0",
    date: "2026-01-10",
    isInitial: true,
    added: [
      "GateCtr platform — first public release.",
      "Clerk authentication — SSO, MFA, and OAuth.",
      "Multi-tenant workspace management.",
      "Real-time usage dashboard.",
      "3-step onboarding — workspace, LLM provider, budget.",
      "Waitlist and admin panel.",
    ],
  },
];

export default async function ChangelogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "changelog" });
  const context = await getSeoContext();
  const url = buildCanonicalUrl("/changelog", locale, context);

  return (
    <>
      <WebPageJsonLd
        url={url}
        name={t("metadata.title")}
        description={t("metadata.description")}
      />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="mb-12">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">
            {t("page.title")}
          </h1>
          <p className="text-muted-foreground">{t("page.subtitle")}</p>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div
            className="absolute left-0 top-2 bottom-0 w-px bg-border"
            aria-hidden
          />

          <ol className="space-y-12 pl-8">
            {RELEASES.map((release) => (
              <li key={release.version} className="relative">
                {/* Timeline dot */}
                <div
                  className="absolute -left-8 top-1.5 size-2.5 rounded-full bg-primary border-2 border-background"
                  aria-hidden
                />

                <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 mb-4">
                  <span className="font-mono text-sm font-semibold text-foreground">
                    {release.version}
                  </span>
                  <time
                    dateTime={release.date}
                    className="text-xs text-muted-foreground"
                  >
                    {release.date}
                  </time>
                </div>

                {"added" in release && release.added.length > 0 && (
                  <section className="mb-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {release.isInitial
                        ? t("release.initial")
                        : t("release.added")}
                    </h3>
                    <ul className="space-y-1.5">
                      {release.added.map((item) => (
                        <li
                          key={item}
                          className="flex gap-2 text-sm text-muted-foreground"
                        >
                          <span
                            className="mt-1.5 size-1.5 rounded-full bg-primary/60 shrink-0"
                            aria-hidden
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {"infrastructure" in release &&
                  release.infrastructure &&
                  release.infrastructure.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        {t("release.infrastructure")}
                      </h3>
                      <ul className="space-y-1.5">
                        {release.infrastructure.map((item) => (
                          <li
                            key={item}
                            className="flex gap-2 text-sm text-muted-foreground"
                          >
                            <span
                              className="mt-1.5 size-1.5 rounded-full bg-secondary/60 shrink-0"
                              aria-hidden
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
              </li>
            ))}
          </ol>
        </div>
      </main>
    </>
  );
}
