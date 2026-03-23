import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";

function requestId() {
  return randomBytes(8).toString("hex");
}

// ─── POST /api/v1/teams/invitations/[token]/accept — accept invitation ─────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
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

    const { token } = await params;

    const invitation = await prisma.teamInvitation.findUnique({
      where: { token },
    });

    if (!invitation)
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers },
      );

    if (invitation.acceptedAt !== null)
      return NextResponse.json(
        { error: "invitation_already_accepted" },
        { status: 409, headers },
      );

    if (invitation.expiresAt < new Date())
      return NextResponse.json(
        { error: "invitation_expired" },
        { status: 410, headers },
      );

    await prisma.teamMember.create({
      data: {
        teamId: invitation.teamId,
        userId: dbUser.id,
        role: invitation.role,
      },
    });

    await prisma.teamInvitation.update({
      where: { token },
      data: { acceptedAt: new Date() },
    });

    logAudit({
      userId: dbUser.id,
      resource: "team_invitation",
      action: "accepted",
      resourceId: invitation.teamId,
      success: true,
    }).catch(() => {});

    dispatchWebhook(dbUser.id, "team.member.added", {
      team_id: invitation.teamId,
      member_id: dbUser.id,
      role: invitation.role,
    }).catch(() => {});

    return NextResponse.json({ success: true }, { headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
