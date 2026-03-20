import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import * as Sentry from "@sentry/nextjs";

const INCLUDED_SEATS = 3; // TEAM plan base seats — 4th member and beyond billed at €15/user/month

/**
 * Update the seat quantity on the Stripe subscription for a TEAM plan user.
 * Only bills for seats beyond the 20 included in the base plan.
 * Throws on Stripe error — callers should handle.
 */
export async function updateSeatCount(
  userId: string,
  newMemberCount: number,
): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: {
      stripeSubscriptionId: true,
      stripeSeatsItemId: true,
      status: true,
    },
  });

  // Only update for active subscriptions with a seats item
  if (!subscription || subscription.status !== "ACTIVE") return;
  if (!subscription.stripeSeatsItemId || !subscription.stripeSubscriptionId)
    return;

  const overageSeats = Math.max(0, newMemberCount - INCLUDED_SEATS);

  try {
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      items: [
        {
          id: subscription.stripeSeatsItemId,
          quantity: overageSeats,
        },
      ],
      proration_behavior: "always_invoice",
    });
  } catch (err) {
    Sentry.captureException(err, {
      extra: { userId, newMemberCount, overageSeats },
    });
    throw err;
  }
}
