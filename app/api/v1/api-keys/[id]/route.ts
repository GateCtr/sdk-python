import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";
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

  const apiKey = await prisma.apiKey.findFirst({
    where: { id, teamId: ctx.teamId },
  });

  if (!apiKey)
    return NextResponse.json({ error: "Not found" }, { status: 404, headers });

  await prisma.apiKey.update({ where: { id }, data: { isActive: false } });

  logAudit({
    userId: ctx.userId,
    resource: "api_key",
    action: "revoked",
    resourceId: id,
    success: true,
    ipAddress:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  }).catch(() => {});

  dispatchWebhook(ctx.userId, "api_key.revoked", {
    api_key_id: id,
    name: apiKey.name,
  }).catch(() => {});

  return NextResponse.json({ success: true }, { headers });
}
