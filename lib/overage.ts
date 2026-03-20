import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";

/**
 * Record overage tokens for a PRO/TEAM user.
 * Uses Stripe Billing Meter Events API (2025-03-31.basil+).
 * Fire-and-forget — never throws.
 */
export async function recordOverage(
  userId: string,
  overageTokens: number,
): Promise<void> {
  if (overageTokens <= 0) return;

  try {
    // Get the Stripe customer ID for this user
    const subscription = await prisma.subscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true, stripeMeteredItemId: true },
    });

    if (!subscription?.stripeCustomerId) return;

    // Report to Stripe via Meter Events API
    // event_name must match the meter created in setup-stripe-prices.ts ("token_overage")
    await stripe.billing.meterEvents.create({
      event_name: "token_overage",
      payload: {
        stripe_customer_id: subscription.stripeCustomerId,
        // value = number of 10M-token units consumed (billed at $5 each)
        value: String(Math.ceil(overageTokens / 10_000_000)),
      },
    });

    // Update DailyUsageCache.overageTokens for today
    const today = new Date().toISOString().slice(0, 10);
    await prisma.dailyUsageCache.upsert({
      where: {
        userId_projectId_date: {
          userId,
          projectId: null as unknown as string,
          date: today,
        },
      },
      update: { overageTokens: { increment: overageTokens } },
      create: {
        userId,
        date: today,
        overageTokens,
      },
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { userId, overageTokens } });
    // Never throw — fire-and-forget
  }
}
