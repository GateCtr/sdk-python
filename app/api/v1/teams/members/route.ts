import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { updateSeatCount } from "@/lib/seats";
import { checkQuota } from "@/lib/plan-guard";
import { quotaExceededResponse } from "@/lib/quota-response";
import { dispatchWebhook } from "@/lib/webhooks";
import { logAudit } from "@/lib/audit";

// ─── POST /api/v1/teams/members — add a member ────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Check team_members quota before adding
  const quotaResult = await checkQuota(user.id, "team_members");
  if (!quotaResult.allowed) return quotaExceededResponse(quotaResult);

  const { teamId, memberId, role } = await req.json();

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.teamMember.create({
    data: { teamId, userId: memberId, role: role ?? "MEMBER" },
  });

  // Update seat billing after adding member
  const newCount = await prisma.teamMember.count({ where: { teamId } });
  await updateSeatCount(user.id, newCount).catch(console.error);

  logAudit({
    userId: user.id,
    resource: "team",
    action: "member.added",
    resourceId: teamId,
    newValue: { memberId, role: role ?? "MEMBER" },
    success: true,
  }).catch(() => {});

  dispatchWebhook(user.id, "team.member.added", {
    team_id: teamId,
    member_id: memberId,
    role: role ?? "MEMBER",
  }).catch(() => {});

  return NextResponse.json({ success: true });
}

// ─── DELETE /api/v1/teams/members — remove a member ──────────────────────────

export async function DELETE(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { teamId, memberId } = await req.json();

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team || team.ownerId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.teamMember.delete({
    where: { teamId_userId: { teamId, userId: memberId } },
  });

  // Update seat billing after removing member
  const newCount = await prisma.teamMember.count({ where: { teamId } });
  await updateSeatCount(user.id, newCount).catch(console.error);

  logAudit({
    userId: user.id,
    resource: "team",
    action: "member.removed",
    resourceId: teamId,
    oldValue: { memberId },
    success: true,
  }).catch(() => {});

  dispatchWebhook(user.id, "team.member.removed", {
    team_id: teamId,
    member_id: memberId,
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
