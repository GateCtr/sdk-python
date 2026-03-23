import { Worker, type Job } from "bullmq";
import { createHmac } from "crypto";
import { randomUUID } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { redisConnection, type WebhookJobData } from "@/lib/queues";

const MAX_RESPONSE_BYTES = 1_048_576; // 1 MB
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];
const DELIVERY_TIMEOUT_MS = 10_000;

async function deliverToWebhook(
  webhookId: string,
  url: string,
  secret: string,
  event: string,
  userId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const deliveryId = randomUUID();
  const canonicalPayload: Prisma.InputJsonValue = {
    event,
    project_id: userId,
    timestamp: new Date().toISOString(),
    data: payload as Prisma.InputJsonValue,
  };
  const body = JSON.stringify(canonicalPayload);
  const signature =
    "hmac-sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  let lastError: string | null = null;
  let attempt = 0;

  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    attempt = i + 1;
    const startMs = Date.now();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-GateCtr-Signature": signature,
            "X-GateCtr-Event": event,
            "X-GateCtr-Delivery": deliveryId,
          },
          body,
          redirect: "error",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const responseMs = Date.now() - startMs;
      // Truncate response body if > 1MB
      let responseBody: string | null = null;
      try {
        const raw = await res.text();
        responseBody =
          raw.length > MAX_RESPONSE_BYTES
            ? raw.slice(0, MAX_RESPONSE_BYTES) + "[truncated]"
            : raw;
      } catch {
        // ignore body read errors
      }

      const success = res.ok;

      // Write delivery record
      await prisma.webhookDelivery.create({
        data: {
          webhookId,
          deliveryId,
          event,
          payload: canonicalPayload,
          status: res.status,
          responseMs,
          success,
          retryCount: i,
          error: success ? null : (responseBody ?? res.statusText),
        },
      });

      console.info("[webhook-worker]", {
        webhookId,
        event,
        deliveryId,
        statusCode: res.status,
        responseMs,
        attempt,
        success,
      });

      if (success) {
        // Update success counters
        await prisma.webhook.update({
          where: { id: webhookId },
          data: {
            successCount: { increment: 1 },
            lastFiredAt: new Date(),
          },
        });
        return;
      }

      // 4xx (except 429) — fail immediately, no retry
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        lastError = `HTTP ${res.status}`;
        break;
      }

      // 429 — retry after Retry-After header
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
        if (i < RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }
        lastError = "HTTP 429 — max retries reached";
        break;
      }

      // 5xx — exponential backoff
      lastError = `HTTP ${res.status}`;
      if (i < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
      }
    } catch (err) {
      const responseMs = Date.now() - startMs;
      lastError = err instanceof Error ? err.message : String(err);

      await prisma.webhookDelivery.create({
        data: {
          webhookId,
          deliveryId,
          event,
          payload: canonicalPayload,
          status: 0,
          responseMs,
          success: false,
          retryCount: i,
          error: lastError,
        },
      });

      console.info("[webhook-worker]", {
        webhookId,
        event,
        deliveryId,
        statusCode: 0,
        responseMs,
        attempt,
        success: false,
      });

      if (i < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
      }
    }
  }

  // All retries exhausted — increment failCount, auto-disable if > 10
  const updated = await prisma.webhook.update({
    where: { id: webhookId },
    data: { failCount: { increment: 1 } },
    select: { failCount: true },
  });

  if (updated.failCount > 10) {
    await prisma.webhook.update({
      where: { id: webhookId },
      data: { isActive: false },
    });
  }

  throw new Error(
    `Webhook delivery failed after ${attempt} attempts: ${lastError}`,
  );
}

async function processJob(job: Job<WebhookJobData>): Promise<void> {
  const { userId, event, payload } = job.data;

  const webhooks = await prisma.webhook.findMany({
    where: {
      userId,
      isActive: true,
      OR: [{ events: { has: event } }, { events: { has: "*" } }],
    },
    select: { id: true, url: true, secret: true },
  });

  if (webhooks.length === 0) return;

  await Promise.allSettled(
    webhooks.map((wh) =>
      deliverToWebhook(wh.id, wh.url, wh.secret, event, userId, payload),
    ),
  );
}

export const webhookWorker = new Worker<WebhookJobData>(
  "webhooks",
  processJob,
  {
    connection: redisConnection,
    concurrency: 10,
    lockDuration: 30_000,
    skipVersionCheck: true,
  },
);

webhookWorker.on("failed", (job, err) => {
  console.error("[webhook-worker] job failed", {
    jobId: job?.id,
    attemptsMade: job?.attemptsMade,
    error: err.message,
  });

  const data = job?.data;
  if (data) {
    Sentry.captureException(err, {
      extra: {
        webhookId: data.webhookId,
        event: data.event,
        url: undefined,
        lastError: err.message,
      },
    });
  }
});

webhookWorker.on("completed", (job) => {
  console.debug("[webhook-worker] job completed", {
    jobId: job.id,
    queue: "webhooks",
    attemptsMade: job.attemptsMade,
  });
});
