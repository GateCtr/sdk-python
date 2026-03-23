import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";
import type { TeamRole } from "@prisma/client";

const VALID_ROLES: TeamRole[] = ["ADMIN", "MEMBER", "VIEWER"];

function requestId() {
  return randomBytes(8).toString("hex");
}

// ─── PATCH /api/v1/teams/members/[memberId]/role ──────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  try {
    const { userId: clerkId } = await auth();
    if (!clerkId)
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers },
      );

    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers },
      );

    const { memberId } = await params;

    const member = await prisma.teamMember.findUnique({
      where: { id: memberId },
      select: { id: true, teamId: true, userId: true, role: true },
    });
    if (!member)
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers },
      );

    const team = await prisma.team.findUnique({
      where: { id: member.teamId },
      select: { ownerId: true },
    });
    if (!team || team.ownerId !== dbUser.id)
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers },
      );

    const body = (await req.json()) as { role?: string };

    if (!body.role || !VALID_ROLES.includes(body.role as TeamRole))
      return NextResponse.json(
        { error: "invalid_role" },
        { status: 400, headers },
      );

    // Prevent owner from changing their own role via this endpoint
    if (member.userId === dbUser.id)
      return NextResponse.json(
        { error: "cannot_change_owner_role" },
        { status: 400, headers },
      );

    const oldRole = member.role;
    const updated = await prisma.teamMember.update({
      where: { id: memberId },
      data: { role: body.role as TeamRole },
    });

    logAudit({
      userId: dbUser.id,
      resource: "team_member",
      action: "role.updated",
      resourceId: memberId,
      oldValue: { role: oldRole },
      newValue: { role: body.role },
      success: true,
    }).catch(() => {});

    dispatchWebhook(dbUser.id, "team.member.role_updated", {
      team_id: member.teamId,
      member_id: memberId,
      old_role: oldRole,
      new_role: body.role,
    }).catch(() => {});

    return NextResponse.json(updated, { headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
