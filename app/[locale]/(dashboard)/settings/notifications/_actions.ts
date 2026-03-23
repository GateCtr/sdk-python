"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { validateCsrf } from "@/lib/csrf";
import type { Prisma } from "@prisma/client";

const VALID_ALERT_TYPES = [
  "budget_threshold",
  "token_limit",
  "error_rate",
  "latency",
] as const;

export async function saveAlertRule(formData: FormData) {
  await validateCsrf();
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "not_authenticated" };

  const name = formData.get("name")?.toString().trim();
  const alertType = formData.get("alertType")?.toString();
  const threshold = parseInt(formData.get("threshold")?.toString() ?? "80", 10);
  const webhookUrl = formData.get("webhookUrl")?.toString().trim() || null;

  const channels: string[] = [];
  if (formData.get("channel_email") === "on") channels.push("email");
  if (formData.get("channel_webhook") === "on") channels.push("webhook");
  if (formData.get("channel_slack") === "on") channels.push("slack");

  if (!name) return { error: "name_required" };
  if (channels.length === 0) return { error: "channel_required" };
  if (
    !alertType ||
    !VALID_ALERT_TYPES.includes(alertType as (typeof VALID_ALERT_TYPES)[number])
  )
    return { error: "invalid_alert_type" };

  if (
    (channels.includes("webhook") || channels.includes("slack")) &&
    webhookUrl
  ) {
    try {
      new URL(webhookUrl);
    } catch {
      return { error: "invalid_url" };
    }
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser) return { error: "user_not_found" };

    const condition: Record<string, unknown> = { threshold };
    if (webhookUrl) condition.webhookUrl = webhookUrl;

    const rule = await prisma.alertRule.create({
      data: {
        userId: dbUser.id,
        name,
        alertType,
        condition: condition as Prisma.InputJsonValue,
        channels,
      },
    });

    logAudit({
      userId: dbUser.id,
      actorId: dbUser.id,
      resource: "alert_rule",
      action: "alert_rule.created",
      resourceId: rule.id,
      newValue: { name, alertType, channels },
      success: true,
    }).catch(() => {});

    return {
      success: true,
      rule: {
        id: rule.id,
        name: rule.name,
        alertType: rule.alertType,
        condition: rule.condition as Record<string, unknown>,
        channels: rule.channels,
        createdAt: rule.createdAt.toISOString(),
      },
    };
  } catch {
    return { error: "internal_error" };
  }
}

export async function deleteAlertRule(id: string) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return { error: "not_authenticated" };

  try {
    const dbUser = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!dbUser) return { error: "user_not_found" };

    const rule = await prisma.alertRule.findUnique({ where: { id } });
    if (!rule || rule.userId !== dbUser.id) return { error: "forbidden" };

    await prisma.alertRule.delete({ where: { id } });

    logAudit({
      userId: dbUser.id,
      actorId: dbUser.id,
      resource: "alert_rule",
      action: "alert_rule.deleted",
      resourceId: id,
      success: true,
    }).catch(() => {});

    return { success: true };
  } catch {
    return { error: "internal_error" };
  }
}
