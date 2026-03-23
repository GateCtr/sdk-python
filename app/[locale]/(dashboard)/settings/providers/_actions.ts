"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { resolveTeamContext } from "@/lib/team-context";

const VALID_PROVIDERS = ["openai", "anthropic", "mistral", "gemini"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

export async function addProviderKey(formData: FormData) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "internal_error" as const };

  const provider = formData.get("provider") as string;
  const apiKey = formData.get("apiKey") as string;
  const name = (formData.get("keyName") as string)?.trim() || "Default";

  if (!provider || !VALID_PROVIDERS.includes(provider as Provider)) {
    return { error: "provider_required" as const };
  }
  if (!apiKey?.trim()) return { error: "key_required" as const };
  if (!name) return { error: "name_required" as const };

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) return { error: "internal_error" as const };

  const existing = await prisma.lLMProviderKey.findUnique({
    where: { userId_provider_name: { userId: ctx.userId, provider, name } },
  });
  if (existing) return { error: "already_exists" as const };

  try {
    const encryptedApiKey = encrypt(apiKey.trim());
    const key = await prisma.lLMProviderKey.create({
      data: {
        userId: ctx.userId,
        teamId: ctx.teamId,
        provider,
        name,
        encryptedApiKey,
      },
      select: {
        id: true,
        provider: true,
        name: true,
        isActive: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
    return { data: key };
  } catch {
    return { error: "internal_error" as const };
  }
}

export async function revokeProviderKey(id: string) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "internal_error" as const };

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) return { error: "internal_error" as const };

  const key = await prisma.lLMProviderKey.findFirst({
    where: { id, userId: ctx.userId },
  });
  if (!key) return { error: "internal_error" as const };

  await prisma.lLMProviderKey.update({
    where: { id },
    data: { isActive: false },
  });

  return { success: true };
}
