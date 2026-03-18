import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import {
  getSeoContext,
  buildCanonicalUrl,
  buildAlternateUrls,
  buildOgLocale,
} from "@/lib/seo";
import { Header } from "@/components/shared/header";
import { Footer } from "@/components/shared/footer";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.marketing" });
  const context = await getSeoContext();
  const canonical = buildCanonicalUrl("/", locale, context);
  const alternates = buildAlternateUrls("/", context);
  const og = buildOgLocale(locale);

  return {
    title: { default: t("defaultTitle"), template: "%s | GateCtr" },
    description: t("defaultDescription"),
    robots: { index: true, follow: true },
    alternates: {
      canonical,
      languages: {
        en: alternates.en,
        fr: alternates.fr,
      },
    },
    openGraph: {
      type: "website",
      siteName: "GateCtr",
      locale: og.locale,
      alternateLocale: og.alternateLocale,
      images: [{ url: "/og/default.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      images: ["/og/default.png"],
    },
  };
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header variant="marketing" />
      <main className="flex-1 flex items-center justify-center px-4 pt-8 pb-12">
        {children}
      </main>
      <Footer variant="marketing" />
    </div>
  );
}
