"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export interface OnboardingData {
  orgName: string;
  usageType: string;
  useCase: string;
  teamSize: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Generate a unique slug by appending a random suffix if needed */
async function uniqueSlug(base: string): Promise<string> {
  const slug = slugify(base);
  const existing = await prisma.team.findUnique({ where: { slug } });
  if (!existing) return slug;
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function completeOnboarding(formData: FormData) {
  const { userId } = await auth();

  if (!userId) {
    return { error: "Not authenticated" };
  }

  const orgName = formData.get("orgName")?.toString().trim();

  if (!orgName) {
    return { error: "orgName_required" };
  }

  const data: OnboardingData = {
    orgName,
    usageType: formData.get("usageType")?.toString() ?? "personal",
    useCase: formData.get("useCase")?.toString() ?? "other",
    teamSize: formData.get("teamSize")?.toString() ?? "solo",
  };

  try {
    // 1. Find the user in our database
    const dbUser = await prisma.user.findUnique({ where: { clerkId: userId } });
    if (!dbUser) {
      return { error: "user_not_found" };
    }

    // Idempotency guard — already completed, skip all writes
    const meta = dbUser.metadata as Record<string, unknown> | null;
    if (meta?.onboardingComplete === true) {
      return { success: true };
    }

    // 3. Always create a team (personal workspace or org)
    const slug = await uniqueSlug(orgName);

    const team = await prisma.team.create({
      data: {
        name: orgName,
        slug,
        ownerId: dbUser.id,
        members: {
          create: {
            userId: dbUser.id,
            role: "OWNER",
          },
        },
      },
    });

    // Store activeTeamId in user metadata so the dashboard knows which team is active
    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        metadata: {
          useCase: data.useCase,
          teamSize: data.teamSize,
          usageType: data.usageType,
          onboardingComplete: true,
          activeTeamId: team.id,
        },
      },
    });

    await logAudit({
      userId: dbUser.id,
      actorId: dbUser.id,
      resource: "team",
      action: "team.created",
      resourceId: team.id,
      newValue: { name: orgName, slug, usageType: data.usageType },
      success: true,
    });

    // 4. Sync to Clerk publicMetadata — only system flags, no business data
    const client = await clerkClient();
    await client.users.updateUser(userId, {
      publicMetadata: {
        onboardingComplete: true,
      },
    });

    return { success: true };
  } catch (err) {
    console.error("completeOnboarding error:", err);
    return { error: "update_failed" };
  }
}
