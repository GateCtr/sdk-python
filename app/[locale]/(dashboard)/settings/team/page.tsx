import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { TeamForm } from "@/components/settings/team-form";

export default async function TeamSettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const t = await getTranslations("settingsTeam");

  const dbUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, metadata: true, plan: true },
  });

  const meta = (dbUser?.metadata ?? {}) as Record<string, unknown>;
  const activeTeamId = meta.activeTeamId as string | undefined;

  // Same fallback as /api/v1/teams/active
  let teamId = activeTeamId;
  if (!teamId && dbUser) {
    const membership = await prisma.teamMember.findFirst({
      where: { userId: dbUser.id },
      orderBy: { createdAt: "asc" },
      select: { teamId: true },
    });
    teamId = membership?.teamId;
  }

  type MemberWithUser = Awaited<
    ReturnType<
      typeof prisma.teamMember.findMany<{
        include: { user: { select: { name: true; email: true } } };
      }>
    >
  >;
  type InvitationWithInvitedBy = Awaited<
    ReturnType<
      typeof prisma.teamInvitation.findMany<{
        include: { invitedBy: { select: { name: true; email: true } } };
      }>
    >
  >;

  const [members, invitations]: [MemberWithUser, InvitationWithInvitedBy] =
    teamId
      ? await Promise.all([
          prisma.teamMember.findMany({
            where: { teamId },
            include: { user: { select: { name: true, email: true } } },
            orderBy: { createdAt: "asc" },
          }),
          prisma.teamInvitation.findMany({
            where: {
              teamId,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            include: {
              invitedBy: { select: { name: true, email: true } },
            },
            orderBy: { createdAt: "desc" },
          }),
        ])
      : [[], []];

  const isPro =
    dbUser?.plan === "PRO" ||
    dbUser?.plan === "TEAM" ||
    dbUser?.plan === "ENTERPRISE";

  const serializedMembers = members.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    joinedAt: m.createdAt.toISOString(),
    user: { name: m.user.name, email: m.user.email },
  }));

  const serializedInvitations = invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    expiresAt: inv.expiresAt.toISOString(),
    invitedBy: inv.invitedBy
      ? { name: inv.invitedBy.name, email: inv.invitedBy.email }
      : null,
  }));

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("page.description")}
        </p>
      </div>
      <TeamForm
        members={serializedMembers}
        invitations={serializedInvitations}
        currentUserId={dbUser?.id ?? ""}
        isPro={isPro}
      />
    </div>
  );
}
