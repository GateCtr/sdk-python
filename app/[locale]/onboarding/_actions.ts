"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { checkQuota } from "@/lib/plan-guard";
import { isValidProvider } from "@/lib/providers";
import { sendOnboardingCompleteEmail } from "@/lib/resend";
import { validateCsrf } from "@/lib/csrf";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

async function uniqueProjectSlug(base: string): Promise<string> {
  const slug = slugify(base);
  const existing = await prisma.project.findUnique({ where: { slug } });
  if (!existing) return slug;
  return `${slug}-${Math.random().toString(36).slice(2, 7)}`;
}

async function getDbUser(clerkId: string) {
  return prisma.user.findUnique({ where: { clerkId } });
}

// ─── Step 1 — Workspace ───────────────────────────────────────────────────────

export async function createWorkspace(formData: FormData) {
  await validateCsrf();
  const { userId } = await auth();
  if (!userId) return { error: "not_authenticated" };

  const workspaceName = formData.get("workspaceName")?.toString().trim();
  if (!workspaceName || workspaceName.length < 2)
    return { error: "name_required" };

  const usageType = formData.get("usageType")?.toString() ?? "solo";

  try {
    const dbUser = await getDbUser(userId);
    if (!dbUser) return { error: "user_not_found" };

    const meta = dbUser.metadata as Record<string, unknown> | null;
    if (meta?.onboardingComplete === true) return { success: true };

    const slug = await uniqueSlug(workspaceName);
    const team = await prisma.team.create({
      data: {
        name: workspaceName,
        slug,
        ownerId: dbUser.id,
        members: { create: { userId: dbUser.id, role: "OWNER" } },
      },
    });

    await prisma.user.update({
      where: { id: dbUser.id },
      data: {
        metadata: {
          ...(meta ?? {}),
          usageType,
          activeTeamId: team.id,
          onboardingComplete: false,
        },
      },
    });

    await logAudit({
      userId: dbUser.id,
      actorId: dbUser.id,
      resource: "team",
      action: "team.created",
      resourceId: team.id,
      newValue: { name: workspaceName, slug, usageType },
      success: true,
    });

    return { success: true, teamId: team.id };
  } catch (err) {
    console.error("createWorkspace error:", err);
    return { error: "failed" };
  }
}

// ─── Step 2 — Connect LLM Provider ───────────────────────────────────────────

export async function connectProvider(formData: FormData) {
  await validateCsrf();
  const { userId } = await auth();
  if (!userId) return { error: "not_authenticated" };

  const provider = formData.get("provider")?.toString() ?? "";
  const apiKey = formData.get("apiKey")?.toString().trim();
  const name = formData.get("name")?.toString().trim() || "Default";

  if (!isValidProvider(provider)) return { error: "provider_required" };
  if (!apiKey) return { error: "key_required" };

  try {
    const dbUser = await getDbUser(userId);
    if (!dbUser) return { error: "user_not_found" };

    const meta = dbUser.metadata as Record<string, unknown> | null;
    const teamId = meta?.activeTeamId as string | undefined;

    const encryptedApiKey = encrypt(apiKey);

    await prisma.lLMProviderKey.upsert({
      where: { userId_provider_name: { userId: dbUser.id, provider, name } },
      create: {
        userId: dbUser.id,
        teamId: teamId ?? null,
        provider,
        name,
        encryptedApiKey,
        isActive: true,
      },
      update: { encryptedApiKey, isActive: true, teamId: teamId ?? null },
    });

    await logAudit({
      userId: dbUser.id,
      actorId: dbUser.id,
      resource: "llm_provider_key",
      action: "provider_key.created",
      newValue: { provider, name },
      success: true,
    });

    return { success: true };
  } catch (err) {
    console.error("connectProvider error:", err);
    return { error: "failed" };
  }
}

// ─── Step 3 — Budget ─────────────────────────────────────────────────────────

export async function setupBudget(formData: FormData) {
  await validateCsrf();
  const { userId } = await auth();
  if (!userId) return { error: "not_authenticated" };

  const monthlyTokens = parseInt(
    formData.get("monthlyTokenLimit")?.toString() ?? "0",
    10,
  );
  const alertThreshold = parseInt(
    formData.get("alertThreshold")?.toString() ?? "80",
    10,
  );
  const hardStop = formData.get("hardStop") === "true";

  try {
    const dbUser = await getDbUser(userId);
    if (!dbUser) return { error: "user_not_found" };

    await prisma.budget.upsert({
      where: { userId: dbUser.id },
      create: {
        userId: dbUser.id,
        maxTokensPerMonth: monthlyTokens > 0 ? monthlyTokens : null,
        alertThresholdPct: alertThreshold,
        hardStop,
        notifyOnThreshold: true,
        notifyOnExceeded: true,
      },
      update: {
        maxTokensPerMonth: monthlyTokens > 0 ? monthlyTokens : null,
        alertThresholdPct: alertThreshold,
        hardStop,
      },
    });

    return { success: true };
  } catch (err) {
    console.error("setupBudget error:", err);
    return { error: "failed" };
  }
}

// ─── Step 4 — First Project ───────────────────────────────────────────────────

export async function createFirstProject(formData: FormData) {
  await validateCsrf();
  const { userId } = await auth();
  if (!userId) return { error: "not_authenticated" };

  const projectName = formData.get("projectName")?.toString().trim();
  if (!projectName || projectName.length < 2) return { error: "name_required" };

  try {
    const dbUser = await getDbUser(userId);
    if (!dbUser) return { error: "user_not_found" };

    // Use plan-guard to check project quota
    const quota = await checkQuota(dbUser.id, "projects");
    if (!quota.allowed) return { error: "quota_exceeded" };

    const meta = dbUser.metadata as Record<string, unknown> | null;
    const teamId = meta?.activeTeamId as string | undefined;

    const slug = await uniqueProjectSlug(projectName);
    const project = await prisma.project.create({
      data: {
        userId: dbUser.id,
        teamId: teamId ?? null,
        name: projectName,
        slug,
        isActive: true,
      },
    });

    await logAudit({
      userId: dbUser.id,
      actorId: dbUser.id,
      resource: "project",
      action: "project.created",
      resourceId: project.id,
      newValue: { name: projectName, slug },
      success: true,
    });

    return { success: true, projectId: project.id };
  } catch (err) {
    console.error("createFirstProject error:", err);
    return { error: "failed" };
  }
}

// ─── Finalize — mark complete + send email ────────────────────────────────────

export async function finalizeOnboarding(formData: FormData) {
  const { userId } = await auth();
  if (!userId) return { error: "not_authenticated" };

  const locale = (formData.get("locale")?.toString() ?? "en") as "en" | "fr";

  try {
    const dbUser = await getDbUser(userId);
    if (!dbUser) return { error: "user_not_found" };

    const meta = (dbUser.metadata as Record<string, unknown>) ?? {};

    // Check if provider was connected
    const hasProvider = await prisma.lLMProviderKey
      .count({
        where: { userId: dbUser.id, isActive: true },
      })
      .then((c) => c > 0);

    // Get workspace name for email
    const team = await prisma.team.findFirst({
      where: { ownerId: dbUser.id },
      orderBy: { createdAt: "desc" },
    });
    const workspaceName = team?.name ?? "My Workspace";

    // Mark complete in DB
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { metadata: { ...meta, onboardingComplete: true } },
    });

    // Sync to Clerk — read-then-merge
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const existingMeta =
      (clerkUser.publicMetadata as Record<string, unknown>) ?? {};
    await client.users.updateUser(userId, {
      publicMetadata: { ...existingMeta, onboardingComplete: true },
    });

    // Send completion email (fire-and-forget — don't block redirect)
    sendOnboardingCompleteEmail(
      dbUser.email,
      dbUser.name,
      workspaceName,
      hasProvider,
      locale,
    ).catch((err) => console.error("Onboarding email failed:", err));

    return { success: true };
  } catch (err) {
    console.error("finalizeOnboarding error:", err);
    return { error: "failed" };
  }
}
