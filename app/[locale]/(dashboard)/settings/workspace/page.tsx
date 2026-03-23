import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { WorkspaceForm } from "@/components/settings/workspace-form";

export default async function WorkspaceSettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const t = await getTranslations("settingsWorkspace");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, metadata: true },
  });

  const meta = (dbUser?.metadata ?? {}) as Record<string, unknown>;
  const activeTeamId = meta.activeTeamId as string | undefined;

  // Mirror the same fallback logic as /api/v1/teams/active:
  // prefer stored activeTeamId, fallback to first team membership
  const membership = dbUser
    ? await prisma.teamMember.findFirst({
        where: {
          userId: dbUser.id,
          ...(activeTeamId ? { teamId: activeTeamId } : {}),
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              avatarUrl: true,
              settings: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      })
    : null;

  const team = membership?.team ?? null;

  const teamSettings =
    (team as { settings?: Record<string, unknown> } | null)?.settings ?? {};
  const initial = {
    name: team?.name ?? "",
    slug: team?.slug ?? "",
    usageType:
      (teamSettings.usageType as string) ??
      (meta.usageType as string) ??
      "solo",
    description: team?.description ?? "",
    avatarUrl: team?.avatarUrl ?? "",
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("page.description")}
        </p>
      </div>
      <WorkspaceForm initial={initial} />
    </div>
  );
}
