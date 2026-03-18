import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { hasPermission, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/auth/permissions/check
 * Checks whether the current user has a specific permission.
 * Body: { permission: string }
 * Requirements: 5.1, 5.2
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let permission: Permission;

  try {
    const body = await req.json();
    permission = body.permission;

    if (!permission || typeof permission !== "string") {
      return NextResponse.json(
        { error: 'Bad Request: "permission" field is required' },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Bad Request: invalid JSON" },
      { status: 400 },
    );
  }

  // Resolve internal user ID from Clerk ID
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowed = await hasPermission(user.id, permission);

  return NextResponse.json({ allowed });
}
