import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { NotificationsForm } from "@/components/settings/notifications-form";

export default async function NotificationsSettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const t = await getTranslations("settingsNotifications");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, plan: true },
  });

  const isPro =
    dbUser?.plan === "PRO" ||
    dbUser?.plan === "TEAM" ||
    dbUser?.plan === "ENTERPRISE";

  const rules = isPro
    ? await prisma.alertRule.findMany({
        where: { userId: dbUser!.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const serialized = rules.map((r) => ({
    id: r.id,
    name: r.name,
    alertType: r.alertType,
    condition: r.condition as Record<string, unknown>,
    channels: r.channels,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("page.description")}
        </p>
      </div>
      <NotificationsForm initialRules={serialized} isPro={isPro} />
    </div>
  );
}
