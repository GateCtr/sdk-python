import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId } = await req.json();
  if (!teamId)
    return NextResponse.json({ error: "teamId required" }, { status: 400 });

  const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!dbUser)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Verify user is a member of this team
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: dbUser.id } },
  });
  if (!membership)
    return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const meta = (dbUser.metadata as Record<string, unknown>) ?? {};
  await prisma.user.update({
    where: { id: dbUser.id },
    data: { metadata: { ...meta, activeTeamId: teamId } },
  });

  return NextResponse.json({ success: true });
}
