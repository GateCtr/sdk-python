"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { invalidatePermissionCache } from "@/lib/permissions";
import type { RoleName } from "@/types/globals";

// ─── Guards ───────────────────────────────────────────────────────────────────

async function assertAdmin() {
  const { sessionClaims, userId } = await auth();
  const role = sessionClaims?.publicMetadata?.role as RoleName | undefined;
  const adminRoles: RoleName[] = ["SUPER_ADMIN", "ADMIN"];
  if (!userId || !role || !adminRoles.includes(role)) {
    throw new Error("Not Authorized");
  }
  return userId;
}

// ─── Set role ─────────────────────────────────────────────────────────────────

/**
 * Assign a role to a user.
 * Updates both the DB (UserRole table) and Clerk publicMetadata.
 */
export async function setRole(formData: FormData) {
  try {
    const actorId = await assertAdmin();
    const clerkId = formData.get("clerkId") as string;
    const roleName = formData.get("role") as RoleName;

    if (!clerkId || !roleName) {
      return { error: "Missing required fields" };
    }

    // Find user in DB
    const user = await prisma.user.findUnique({
      where: { clerkId },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) return { error: "User not found" };

    // Find the role record
    const roleRecord = await prisma.role.findUnique({
      where: { name: roleName },
    });
    if (!roleRecord) return { error: "Role not found" };

    // Replace existing roles with the new one (upsert pattern)
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: user.id } }),
      prisma.userRole.create({
        data: { userId: user.id, roleId: roleRecord.id },
      }),
    ]);

    // Sync to Clerk publicMetadata
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkId, {
      publicMetadata: { role: roleName },
    });

    // Invalidate Redis permission cache
    await invalidatePermissionCache(user.id);

    // Audit log
    await logAudit({
      userId: user.id,
      actorId,
      resource: "user",
      action: "role.granted",
      resourceId: user.id,
      newValue: { role: roleName },
      success: true,
    });

    return { success: true };
  } catch (err) {
    console.error("setRole error:", err);
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ─── Remove role ──────────────────────────────────────────────────────────────

/**
 * Remove all roles from a user (resets to DEVELOPER).
 * Updates both the DB and Clerk publicMetadata.
 */
export async function removeRole(formData: FormData) {
  try {
    const actorId = await assertAdmin();
    const clerkId = formData.get("clerkId") as string;

    if (!clerkId) return { error: "Missing clerkId" };

    const user = await prisma.user.findUnique({ where: { clerkId } });
    if (!user) return { error: "User not found" };

    // Reset to DEVELOPER role
    const developerRole = await prisma.role.findUnique({
      where: { name: "DEVELOPER" },
    });
    if (!developerRole) return { error: "DEVELOPER role not found" };

    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: user.id } }),
      prisma.userRole.create({
        data: { userId: user.id, roleId: developerRole.id },
      }),
    ]);

    // Sync to Clerk publicMetadata
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkId, {
      publicMetadata: { role: "DEVELOPER" },
    });

    // Invalidate Redis permission cache
    await invalidatePermissionCache(user.id);

    // Audit log
    await logAudit({
      userId: user.id,
      actorId,
      resource: "user",
      action: "role.revoked",
      resourceId: user.id,
      newValue: { role: "DEVELOPER" },
      success: true,
    });

    return { success: true };
  } catch (err) {
    console.error("removeRole error:", err);
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
