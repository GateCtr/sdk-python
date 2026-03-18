import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { RoleName } from "@/lib/permissions";

/**
 * GET /api/auth/roles
 * Returns all role names for the currently authenticated user.
 * Requirements: 4.1, 6.2
 */
export async function GET() {
  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: {
      userRoles: {
        select: { role: { select: { name: true } } },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roles: RoleName[] = user.userRoles.map(
    (ur) => ur.role.name as RoleName,
  );

  return NextResponse.json({ roles });
}
