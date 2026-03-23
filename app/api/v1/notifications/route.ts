import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/v1/notifications — unacknowledged alerts for the current user
export async function GET() {
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
    where: { userId: dbUser.id, isActive: true },
    select: { id: true },
  });

  const alerts = await prisma.alert.findMany({
    where: {
      ruleId: { in: ruleIds.map((r) => r.id) },
    },
    include: {
      rule: { select: { id: true, name: true, alertType: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ alerts });
}
