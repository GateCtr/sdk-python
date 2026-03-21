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
    version: "v0.1.0-onboarding",
    date: "2026-03-20",
    added: [
      "3-step onboarding flow: Workspace → LLM Provider → Budget",
      "Step 1: workspace creation with usage type (solo / team / enterprise)",
      "Step 2: LLM provider connection (OpenAI, Anthropic, Mistral, Gemini) with AES-encrypted key storage",
      "Step 3: Budget Firewall setup — monthly token limit, alert threshold, hard stop toggle",
      "Server actions: createWorkspace(), connectProvider(), setupBudget()",
      "lib/encryption.ts — AES-256 encrypt/decrypt for LLM API keys",
      "Onboarding settings page — edit workspace name and provider keys post-onboarding",
      "Admin panel: onboarding status column + manual reset action on users page",
      "Progress indicator (Step X of 3) with step labels",
      "Skip option on provider step with warning copy",
      "Translation files for EN and FR",
      "Full unit test coverage for all 3 steps and server actions",
    ],
  },
  {
    version: "v0.1.0-billing",
    date: "2026-03-20",
    added: [
      "Stripe Checkout integration — hosted payment page per plan (Pro, Team, Enterprise)",
      "Stripe Customer Portal — self-serve subscription management and cancellation",
      "Stripe webhook handler — handles checkout.session.completed, customer.subscription.*, invoice.*",
      "Admin billing panel — list all subscriptions, filter by plan/status, view details",
      "Admin subscription detail page — customer info, plan, status, Stripe links",
      "Admin coupon management — create and list discount coupons via Stripe API",
      "Admin refund action — issue full or partial refunds from the admin panel",
      "Plan guard middleware — blocks access to features above the user's current plan",
      "Seat overage detection — alerts when Team plan exceeds included seats",
      "Upsell banners — contextual upgrade prompts triggered by plan limits",
      "Transactional emails: subscription confirmation, payment failed, cancellation",
      "lib/stripe.ts — lazy singleton client (no module-level instantiation)",
      "Translation files for EN and FR",
    ],
    infrastructure: [
      "CI/CD pipeline with GitHub Actions (lint, test, build, Docker, deploy)",
      "Docker multi-stage build with standalone Next.js output",
      "Husky pre-commit hooks with lint-staged",
      "Dashboard sidebar redesign — active states, team switcher, user menu",
      "Dashboard header — breadcrumb, token usage bar, upgrade CTA",
    ],
  },
  {
    version: "Initial commit",
    date: "2026-03-01",
    isInitial: true,
    added: [
      "GateCtr Next.js project scaffold (Next.js 16, React 19, TypeScript 5, Tailwind 4)",
      "Clerk authentication, Prisma + Neon PostgreSQL, Upstash Redis",
      "next-intl i18n (EN/FR), Sentry error monitoring",
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
