import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/v1/alerts/[id] — acknowledge a single alert
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!dbUser)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { id } = await params;

  // Verify ownership via the rule
  const alert = await prisma.alert.findUnique({
    where: { id },
    include: { rule: { select: { userId: true } } },
  });

  if (!alert || alert.rule.userId !== dbUser.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await prisma.alert.update({
    where: { id },
    data: {
      acknowledged: true,
      acknowledgedAt: new Date(),
      acknowledgedBy: dbUser.id,
    },
  });

  return NextResponse.json({ success: true, alert: updated });
}
