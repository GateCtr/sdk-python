import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

function requestId() {
  return randomBytes(8).toString("hex");
}

// ─── GET /api/v1/teams/invitations/[token] — fetch invitation (no auth) ───────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  try {
    const { token } = await params;

    const invitation = await prisma.teamInvitation.findUnique({
      where: { token },
      include: { team: { select: { name: true } } },
    });

    if (!invitation || invitation.expiresAt < new Date())
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers },
      );

    return NextResponse.json(invitation, { headers });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers },
    );
  }
}
