"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { validateCsrf } from "@/lib/csrf";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function saveWorkspace(formData: FormData) {
  await validateCsrf();
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "not_authenticated" };

  const name = formData.get("name")?.toString().trim();
  const slugInput = formData.get("slug")?.toString().trim();
  const usageType = formData.get("usageType")?.toString() ?? "solo";
  const description = formData.get("description")?.toString().trim() ?? "";
  const avatarUrl = formData.get("avatarUrl")?.toString().trim() ?? "";

  if (!name || name.length < 2) return { error: "name_required" };

  const slug = slugify(slugInput ?? name);

  try {
    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, metadata: true },
    });
    if (!dbUser) return { error: "user_not_found" };

    const meta = (dbUser.metadata ?? {}) as Record<string, unknown>;
    const activeTeamId = meta.activeTeamId as string | undefined;

    // Fallback to first owned team if activeTeamId not set
    let teamId = activeTeamId;
    if (!teamId) {
      const membership = await prisma.teamMember.findFirst({
        where: { userId: dbUser.id },
        orderBy: { createdAt: "asc" },
        select: { teamId: true },
      });
      teamId = membership?.teamId;
    }
    if (!teamId) return { error: "no_active_team" };

    // Check slug uniqueness (excluding current team)
    const existing = await prisma.team.findFirst({
      where: { slug, NOT: { id: teamId } },
    });
    if (existing) return { error: "slug_taken" };

    const team = await prisma.team.update({
      where: { id: teamId },
      data: {
        name,
        slug,
        description: description || null,
        avatarUrl: avatarUrl || null,
        settings: { usageType },
      },
    });

    // Clean up legacy usageType from user.metadata if present
    if ("usageType" in meta) {
      const cleanMeta = { ...meta };
      delete cleanMeta.usageType;
      await prisma.user.update({
        where: { id: dbUser.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { metadata: cleanMeta as any },
      });
    }

    logAudit({
      userId: dbUser.id,
      actorId: dbUser.id,
      resource: "team",
      action: "team.updated",
      resourceId: team.id,
      newValue: { name, slug, description, avatarUrl, usageType },
      success: true,
    }).catch(() => {});

    return { success: true };
  } catch {
    return { error: "internal_error" };
  }
}
