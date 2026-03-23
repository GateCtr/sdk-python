"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { validateCsrf } from "@/lib/csrf";
import { resolveTeamContext } from "@/lib/team-context";
import { getUserPlanType } from "@/lib/plan-guard";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueSlug(base: string): Promise<string> {
  const slug = slugify(base);
  const existing = await prisma.team.findUnique({ where: { slug } });
  if (!existing) return slug;
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

export type CreateWorkspaceError =
  | "not_authenticated"
  | "name_required"
  | "user_not_found"
  | "plan_required" // Free/Pro: only 1 workspace allowed
  | "failed";

/**
 * Multiple workspaces require Team plan or above.
 * Free and Pro users are limited to 1 workspace (their initial team).
 */
export async function createWorkspaceAction(
  formData: FormData,
): Promise<
  | { success: true; teamId: string; teamName: string }
  | { error: CreateWorkspaceError }
> {
  await validateCsrf();
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "not_authenticated" };

  const name = formData.get("name")?.toString().trim();
  if (!name || name.length < 2) return { error: "name_required" };

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) return { error: "user_not_found" };

  const { userId } = ctx;

  // ── Plan gate: Team plan required for multiple workspaces ─────────────────
  const planType = await getUserPlanType(userId);
  if (planType === "FREE" || planType === "PRO") {
    return { error: "plan_required" };
  }

  try {
    const slug = await uniqueSlug(name);
    const team = await prisma.team.create({
      data: {
        name,
        slug,
        ownerId: userId,
        members: { create: { userId, role: "OWNER" } },
      },
    });

    // Switch active team to the new one
    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    const meta = (dbUser?.metadata as Record<string, unknown>) ?? {};
    await prisma.user.update({
      where: { id: userId },
      data: { metadata: { ...meta, activeTeamId: team.id } },
    });

    await logAudit({
      userId,
      actorId: userId,
      resource: "team",
      action: "team.created",
      resourceId: team.id,
      newValue: { name, slug },
      success: true,
    });

    return { success: true, teamId: team.id, teamName: name };
  } catch (err) {
    console.error("createWorkspaceAction error:", err);
    return { error: "failed" };
  }
}
