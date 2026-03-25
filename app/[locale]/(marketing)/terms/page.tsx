import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { FileText } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    robots: { index: true, follow: true },
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.terms" });

  return (
    <main className="w-full">
      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-12 px-4">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[300px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-xs font-mono text-muted-foreground mb-6 backdrop-blur-sm">
            <FileText className="size-3 text-secondary-500" aria-hidden />
            {t("eyebrow")}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-4">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("lastUpdated")}</p>
        </div>
      </section>

      {/* Content */}
      <section className="px-4 pb-24">
        <div className="max-w-3xl mx-auto space-y-12">
          {/* Intro */}
          <div className="rounded-xl border border-border bg-muted/20 px-6 py-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("intro")}
            </p>
          </div>

          <LegalSection title={t("s1.title")}>
            <p>{t("s1.body")}</p>
          </LegalSection>

          <LegalSection title={t("s2.title")}>
            <p>{t("s2.body")}</p>
            <ul>
              <li>{t("s2.item1")}</li>
              <li>{t("s2.item2")}</li>
              <li>{t("s2.item3")}</li>
            </ul>
          </LegalSection>

          <LegalSection title={t("s3.title")}>
            <p>{t("s3.body")}</p>
            <ul>
              <li>{t("s3.item1")}</li>
              <li>{t("s3.item2")}</li>
              <li>{t("s3.item3")}</li>
              <li>{t("s3.item4")}</li>
            </ul>
          </LegalSection>

          <LegalSection title={t("s4.title")}>
            <p>{t("s4.body")}</p>
            <ul>
              <li>{t("s4.item1")}</li>
              <li>{t("s4.item2")}</li>
              <li>{t("s4.item3")}</li>
            </ul>
          </LegalSection>

          <LegalSection title={t("s5.title")}>
            <p>{t("s5.body")}</p>
          </LegalSection>

          <LegalSection title={t("s6.title")}>
            <p>{t("s6.body")}</p>
            <ul>
              <li>{t("s6.item1")}</li>
              <li>{t("s6.item2")}</li>
              <li>{t("s6.item3")}</li>
            </ul>
          </LegalSection>

          <LegalSection title={t("s7.title")}>
            <p>{t("s7.body")}</p>
          </LegalSection>

          <LegalSection title={t("s8.title")}>
            <p>{t("s8.body")}</p>
          </LegalSection>

          <LegalSection title={t("s9.title")}>
            <p>{t("s9.body")}</p>
          </LegalSection>

          <LegalSection title={t("s10.title")}>
            <p>{t("s10.body")}</p>
          </LegalSection>

          {/* Contact */}
          <div className="rounded-xl border border-border bg-muted/20 px-6 py-5">
            <p className="text-xs font-mono text-secondary-500 uppercase tracking-widest mb-2">
              {t("contact.eyebrow")}
            </p>
            <p className="text-sm font-semibold text-foreground mb-1">
              {t("contact.title")}
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              {t("contact.body")}
            </p>
            <a
              href="mailto:legal@gatectr.com"
              className="text-sm text-primary hover:underline font-medium"
            >
              legal@gatectr.com
            </a>
          </div>

          {/* Related */}
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/privacy"
              className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            >
              {t("related.privacy")}
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <Link
              href="/cookies"
              className="text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            >
              {t("related.cookies")}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-bold text-foreground mb-4 pb-2 border-b border-border">
        {title}
      </h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_p]:leading-relaxed">
        {children}
      </div>
    </div>
  );
}
