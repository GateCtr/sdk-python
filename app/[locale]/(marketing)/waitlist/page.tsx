import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSeoContext, buildCanonicalUrl } from "@/lib/seo";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { WebPageJsonLd } from "@/components/seo/json-ld";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "waitlist.metadata" });
  const context = await getSeoContext();
  const canonical = buildCanonicalUrl("/waitlist", locale, context);

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

export default async function WaitlistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "waitlist.metadata" });
  const context = await getSeoContext();
  const url = buildCanonicalUrl("/waitlist", locale, context);

  return (
    <>
      <WebPageJsonLd
        url={url}
        name={t("title")}
        description={t("description")}
      />
      <WaitlistForm />
    </>
  );
}
