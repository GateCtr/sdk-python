import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, metadata: true, plan: true },
  });
  if (!dbUser)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const meta = dbUser.metadata as Record<string, unknown> | null;
  const activeTeamId = meta?.activeTeamId as string | undefined;

  // Find the active team — prefer stored activeTeamId, fallback to first owned team
  const membership = await prisma.teamMember.findFirst({
    where: {
      userId: dbUser.id,
      ...(activeTeamId ? { teamId: activeTeamId } : {}),
    },
    include: { team: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) return NextResponse.json(null);

  return NextResponse.json({
    id: membership.team.id,
    name: membership.team.name,
    slug: membership.team.slug,
    role: membership.role,
    plan: dbUser.plan,
  });
}
