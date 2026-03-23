import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { resolveTeamContext } from "@/lib/team-context";
import { ProvidersForm } from "@/components/settings/providers-form";

export default async function ProvidersSettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const t = await getTranslations("settingsProviders");

  const ctx = await resolveTeamContext(clerkId);

  const keys = ctx
    ? await prisma.lLMProviderKey.findMany({
        where: {
          isActive: true,
          OR: [{ teamId: ctx.teamId }, { userId: ctx.userId, teamId: null }],
        },
        select: {
          id: true,
          provider: true,
          name: true,
          isActive: true,
          lastUsedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("page.description")}
        </p>
      </div>
      <ProvidersForm initialKeys={keys} />
    </div>
  );
}
