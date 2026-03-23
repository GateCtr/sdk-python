import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { emailQueue } from "@/lib/queues";
import { logAudit } from "@/lib/audit";
import type { TeamRole } from "@prisma/client";

function requestId() {
  return randomBytes(8).toString("hex");
}

// ─── POST /api/v1/teams/invitations — create invitation ───────────────────────

export async function POST(req: NextRequest) {
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
      select: { id: true, name: true, metadata: true },
    });
    if (!dbUser)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers },
      );

    const body = (await req.json()) as {
      teamId?: string;
      email?: string;
      role?: string;
    };

    const team = await prisma.team.findUnique({ where: { id: body.teamId } });
    if (!team || team.ownerId !== dbUser.id)
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers },
      );

    const existing = await prisma.teamInvitation.findFirst({
      where: { teamId: body.teamId, email: body.email },
    });
    if (existing)
      return NextResponse.json(
        { error: "invitation_already_exists" },
        { status: 409, headers },
      );

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await prisma.teamInvitation.create({
      data: {
        teamId: body.teamId!,
        email: body.email!,
        role: (body.role ?? "MEMBER") as TeamRole,
        token,
        expiresAt,
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.gatectr.com";
    const acceptUrl = `${appUrl}/api/v1/teams/invitations/${token}/accept`;
    const meta = (dbUser.metadata ?? {}) as Record<string, unknown>;
    const locale: "en" | "fr" = meta.locale === "fr" ? "fr" : "en";
    const inviterName = dbUser.name ?? "Someone";

    emailQueue
      .add("team_invitation", {
        type: "team_invitation",
        to: body.email!,
        inviterName,
        teamName: team.name,
        role: body.role ?? "MEMBER",
        acceptUrl,
        expiryDays: 7,
        locale,
      })
      .catch(() => {});

    logAudit({
      userId: dbUser.id,
      resource: "team_invitation",
      action: "created",
      resourceId: invitation.id,
      success: true,
    }).catch(() => {});

    return NextResponse.json(invitation, { status: 201, headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
