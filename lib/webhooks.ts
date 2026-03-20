import { prisma } from "@/lib/prisma";

/**
 * Dispatch a GateCtr webhook event to all of a user's configured endpoints.
 * Fire-and-forget — errors are caught internally and never propagate.
 */
export async function dispatchWebhook(
  userId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { userId, isActive: true },
    });

    if (webhooks.length === 0) return;

    const payload = {
      event,
      project_id: userId,
      timestamp: new Date().toISOString(),
      data,
    };

    await Promise.allSettled(
      webhooks.map((wh) =>
        fetch(wh.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-GateCtr-Event": event,
            "X-GateCtr-Signature": wh.secret,
          },
          body: JSON.stringify(payload),
        }).then(async (res) => {
          await prisma.webhookDelivery.create({
            data: {
              webhookId: wh.id,
              event,
              payload,
              status: res.status,
              responseMs: 0,
              success: res.ok,
            },
          });
        }),
      ),
    );
  } catch (error) {
    console.error("dispatchWebhook error:", error);
  }
}
