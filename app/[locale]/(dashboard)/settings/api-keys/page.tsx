import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { resolveTeamContext } from "@/lib/team-context";
import { ApiKeysForm } from "@/components/settings/api-keys-form";

export default async function ApiKeysSettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const t = await getTranslations("settingsApiKeys");

  const ctx = await resolveTeamContext(clerkId);

  type ApiKeyRow = {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    projectId: string | null;
    isActive: boolean;
    usageCount: number;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
  };

  const [keys, projects] = ctx
    ? await Promise.all([
        prisma.apiKey.findMany({
          where: { teamId: ctx.teamId },
          select: {
            id: true,
            name: true,
            prefix: true,
            scopes: true,
            projectId: true,
            isActive: true,
            usageCount: true,
            lastUsedAt: true,
            expiresAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.project.findMany({
          where: { teamId: ctx.teamId, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ])
    : ([[], []] as [ApiKeyRow[], { id: string; name: string }[]]);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("page.description")}
        </p>
      </div>
      <ApiKeysForm initialKeys={keys} projects={projects} />
    </div>
  );
}
