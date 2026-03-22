import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blocked.metadata" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export default async function BlockedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "blocked.page" });

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4">
        <div className="text-4xl" aria-hidden>
          🌍
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
        <p className="text-sm text-muted-foreground">
          {t("contact")}{" "}
          <a
            href={`mailto:${t("email")}`}
            className="underline underline-offset-4 hover:text-foreground transition-colors"
          >
            {t("email")}
          </a>
        </p>
      </div>
    </main>
  );
}
