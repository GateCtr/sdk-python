import { useTranslations } from "next-intl";

export default function DashboardPage() {
  const t = useTranslations("dashboard");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <h1 className="text-2xl font-semibold">{t("page.title")}</h1>
      <p className="text-muted-foreground">{t("page.empty")}</p>
    </div>
  );
}
