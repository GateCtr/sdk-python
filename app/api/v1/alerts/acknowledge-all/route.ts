import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/v1/alerts/acknowledge-all — mark all unread alerts as acknowledged
export async function POST() {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!dbUser)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Get all rule IDs owned by this user
  const ruleIds = await prisma.alertRule.findMany({
    where: { userId: dbUser.id },
    select: { id: true },
  });

  await prisma.alert.updateMany({
    where: {
      ruleId: { in: ruleIds.map((r) => r.id) },
      acknowledged: false,
    },
    data: {
      acknowledged: true,
      acknowledgedAt: new Date(),
      acknowledgedBy: dbUser.id,
    },
  });

  return NextResponse.json({ success: true });
}
