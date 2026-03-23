"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { resolveTeamContext } from "@/lib/team-context";
import { randomBytes, createHash } from "crypto";

function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `gct_${randomBytes(24).toString("hex")}`;
  const prefix = raw.slice(0, 12);
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

const ALLOWED_SCOPES = ["complete", "chat", "read", "admin"] as const;

export async function createApiKey(formData: FormData) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "internal_error" as const };

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) return { error: "internal_error" as const };

  const name = (formData.get("name") as string)?.trim();
  const projectId = (formData.get("projectId") as string) || null;
  const rawScopes = formData.getAll("scopes") as string[];
  const scopes =
    rawScopes.length > 0
      ? rawScopes.filter((s) =>
          ALLOWED_SCOPES.includes(s as (typeof ALLOWED_SCOPES)[number]),
        )
      : ["complete", "read"];
  const expiresInDays = parseInt(
    (formData.get("expiresInDays") as string) ?? "0",
    10,
  );
  const expiresAt =
    expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  if (!name) return { error: "name_required" as const };

  // Quota check — count active keys for this team
  const activeCount = await prisma.apiKey.count({
    where: { teamId: ctx.teamId, isActive: true },
  });

  const userWithPlan = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: {
      subscription: { select: { plan: { select: { limits: true } } } },
    },
  });

  const maxApiKeys =
    userWithPlan?.subscription?.plan?.limits?.maxApiKeys ?? null;
  if (maxApiKeys !== null && activeCount >= maxApiKeys) {
    return { error: "quota_exceeded" as const };
  }

  try {
    const { raw, prefix, hash } = generateApiKey();

    const apiKey = await prisma.apiKey.create({
      data: {
        userId: ctx.userId,
        teamId: ctx.teamId,
        name,
        keyHash: hash,
        prefix,
        scopes,
        projectId: projectId || null,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        projectId: true,
        isActive: true,
        usageCount: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return { data: apiKey, raw };
  } catch {
    return { error: "internal_error" as const };
  }
}

export async function revokeApiKey(id: string) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "internal_error" as const };

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) return { error: "internal_error" as const };

  const key = await prisma.apiKey.findFirst({
    where: { id, teamId: ctx.teamId },
  });
  if (!key) return { error: "internal_error" as const };

  await prisma.apiKey.update({ where: { id }, data: { isActive: false } });
  return { success: true };
}

export async function deleteApiKey(id: string) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "internal_error" as const };

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) return { error: "internal_error" as const };

  const key = await prisma.apiKey.findFirst({
    where: { id, teamId: ctx.teamId },
  });
  if (!key) return { error: "internal_error" as const };

  await prisma.apiKey.delete({ where: { id } });
  return { success: true };
}
