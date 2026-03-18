import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Header } from "@/components/shared/header";
import { Footer } from "@/components/shared/footer";
import { Hero } from "@/components/marketing/hero";
import { Logos } from "@/components/marketing/logos";
import { Problem } from "@/components/marketing/problem";
import { Features } from "@/components/marketing/features";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { CodePreview } from "@/components/marketing/code-preview";
import { Metrics } from "@/components/marketing/metrics";
import { Pricing } from "@/components/marketing/pricing";
import { FinalCta } from "@/components/marketing/final-cta";
import { getSeoContext, buildCanonicalUrl } from "@/lib/seo";
import { WebSiteJsonLd, OrganizationJsonLd } from "@/components/seo/json-ld";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.metadata" });
  const context = await getSeoContext();
  const canonical = buildCanonicalUrl("/", locale, context);

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

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home.metadata" });
  const marketingUrl =
    process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://gatectr.com";

  if (process.env.ENABLE_WAITLIST === "true") {
    redirect("/waitlist");
  }

  return (
    <>
      <WebSiteJsonLd
        url={marketingUrl}
        name="GateCtr"
        description={t("description")}
      />
      <OrganizationJsonLd
        url={marketingUrl}
        name="GateCtr"
        logo={`${marketingUrl}/icon1.png`}
        sameAs={[]}
      />
      <div className="min-h-screen flex flex-col bg-background">
        <Header variant="marketing" />
        <main className="flex-1">
          <Hero />
          <Logos />
          <Problem />
          <Features />
          <HowItWorks />
          <CodePreview />
          <Metrics />
          <Pricing />
          <FinalCta />
        </main>
        <Footer variant="marketing" />
      </div>
    </>
  );
}
