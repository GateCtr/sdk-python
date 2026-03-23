import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveTeamContext } from "@/lib/team-context";
import { randomBytes } from "crypto";

function requestId(): string {
  return randomBytes(8).toString("hex");
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };
  const { id } = await params;

  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx)
    return NextResponse.json(
      { error: "No active team" },
      { status: 404, headers },
    );

  const key = await prisma.lLMProviderKey.findFirst({
    where: {
      id,
      OR: [{ teamId: ctx.teamId }, { userId: ctx.userId, teamId: null }],
    },
  });
  if (!key)
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });

  // ?hard=true → permanent delete, otherwise soft revoke
  const hard = new URL(req.url).searchParams.get("hard") === "true";

  if (hard) {
    await prisma.lLMProviderKey.delete({ where: { id } });
  } else {
    await prisma.lLMProviderKey.update({
      where: { id },
      data: { isActive: false },
    });
  }

  return NextResponse.json({ success: true }, { headers });
}
