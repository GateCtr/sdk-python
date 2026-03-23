"use server";

import { auth } from "@clerk/nextjs/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { emailQueue } from "@/lib/queues";
import { logAudit } from "@/lib/audit";
import { validateCsrf } from "@/lib/csrf";
import type { TeamRole } from "@prisma/client";

export async function inviteMember(formData: FormData) {
  await validateCsrf();
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "not_authenticated" };

  const email = formData.get("email")?.toString().trim().toLowerCase();
  const role = (formData.get("role")?.toString() ?? "MEMBER") as TeamRole;

  if (!email) return { error: "email_required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "invalid_email" };

  try {
    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, name: true, metadata: true },
    });
    if (!dbUser) return { error: "user_not_found" };

    const meta = (dbUser.metadata ?? {}) as Record<string, unknown>;
    let teamId = meta.activeTeamId as string | undefined;
    if (!teamId) {
      const m = await prisma.teamMember.findFirst({
        where: { userId: dbUser.id },
        orderBy: { createdAt: "asc" },
        select: { teamId: true },
      });
      teamId = m?.teamId;
    }
    if (!teamId) return { error: "no_active_team" };

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.ownerId !== dbUser.id) return { error: "forbidden" };

    // Check if already a member
    const alreadyMember = await prisma.teamMember.findFirst({
      where: {
        teamId,
        user: { email },
      },
    });
    if (alreadyMember) return { error: "already_member" };

    // Check for existing pending invitation
    const existing = await prisma.teamInvitation.findFirst({
      where: { teamId, email, acceptedAt: null },
    });
    if (existing) return { error: "already_member" };

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.teamInvitation.create({
      data: { teamId, email, role, token, expiresAt },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.gatectr.com";
    const acceptUrl = `${appUrl}/api/v1/teams/invitations/${token}/accept`;
    const locale: "en" | "fr" = meta.locale === "fr" ? "fr" : "en";

    emailQueue
      .add("team_invitation", {
        type: "team_invitation",
        to: email,
        inviterName: dbUser.name ?? "Someone",
        teamName: team.name,
        role,
        acceptUrl,
        expiryDays: 7,
        locale,
      })
      .catch(() => {});

    logAudit({
      userId: dbUser.id,
      actorId: dbUser.id,
      resource: "team_invitation",
      action: "invitation.created",
      resourceId: invitation.id,
      newValue: { email, role },
      success: true,
    }).catch(() => {});

    return { success: true };
  } catch {
    return { error: "internal_error" };
  }
}

export async function removeMember(memberId: string) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "not_authenticated" };

  try {
    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, metadata: true },
    });
    if (!dbUser) return { error: "user_not_found" };

    const meta = (dbUser.metadata ?? {}) as Record<string, unknown>;
    let teamId = meta.activeTeamId as string | undefined;
    if (!teamId) {
      const m = await prisma.teamMember.findFirst({
        where: { userId: dbUser.id },
        orderBy: { createdAt: "asc" },
        select: { teamId: true },
      });
      teamId = m?.teamId;
    }
    if (!teamId) return { error: "no_active_team" };

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.ownerId !== dbUser.id) return { error: "forbidden" };

    const member = await prisma.teamMember.findUnique({
      where: { id: memberId },
    });
    if (!member || member.teamId !== teamId) return { error: "not_found" };
    if (member.userId === dbUser.id) return { error: "cannot_remove_self" };

    await prisma.teamMember.delete({ where: { id: memberId } });

    logAudit({
      userId: dbUser.id,
      actorId: dbUser.id,
      resource: "team_member",
      action: "member.removed",
      resourceId: memberId,
      success: true,
    }).catch(() => {});

    return { success: true };
  } catch {
    return { error: "internal_error" };
  }
}

export async function revokeInvitation(invitationId: string) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "not_authenticated" };

  try {
    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, metadata: true },
    });
    if (!dbUser) return { error: "user_not_found" };

    const meta = (dbUser.metadata ?? {}) as Record<string, unknown>;
    let teamId = meta.activeTeamId as string | undefined;
    if (!teamId) {
      const m = await prisma.teamMember.findFirst({
        where: { userId: dbUser.id },
        orderBy: { createdAt: "asc" },
        select: { teamId: true },
      });
      teamId = m?.teamId;
    }
    if (!teamId) return { error: "no_active_team" };

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.ownerId !== dbUser.id) return { error: "forbidden" };

    const invitation = await prisma.teamInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation || invitation.teamId !== teamId)
      return { error: "not_found" };

    await prisma.teamInvitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });

    logAudit({
      userId: dbUser.id,
      actorId: dbUser.id,
      resource: "team_invitation",
      action: "invitation.revoked",
      resourceId: invitationId,
      success: true,
    }).catch(() => {});

    return { success: true };
  } catch {
    return { error: "internal_error" };
  }
}
