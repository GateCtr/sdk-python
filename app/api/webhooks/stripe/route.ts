import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { logAudit } from "@/lib/audit";
import { dispatchWebhook } from "@/lib/webhooks";
import {
  sendBillingUpgradeEmail,
  sendBillingReceiptEmail,
  sendBillingPaymentFailedEmail,
  sendBillingDowngradeEmail,
  sendBillingCancellationEmail,
  sendBillingRenewalReminderEmail,
} from "@/lib/resend";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function invalidatePlanCache(planType: string) {
  try {
    await redis.del(`plan_limits:${planType}`);
  } catch {
    // fail-open
  }
}

/** Map a Stripe price ID to a PlanType by looking up the Plan table */
async function planTypeFromPriceId(
  priceId: string,
): Promise<"FREE" | "PRO" | "TEAM" | "ENTERPRISE"> {
  const plan = await prisma.plan.findFirst({
    where: {
      OR: [{ stripePriceIdMonthly: priceId }, { stripePriceIdYearly: priceId }],
    },
  });
  return (plan?.name as "FREE" | "PRO" | "TEAM" | "ENTERPRISE") ?? "FREE";
}

/** Extract period start/end from the first subscription item (Stripe v20) */
function getPeriodDates(stripeSub: Stripe.Subscription): {
  start: Date | null;
  end: Date | null;
} {
  const item = stripeSub.items?.data?.[0];
  if (!item) return { start: null, end: null };
  return {
    start: item.current_period_start
      ? new Date(item.current_period_start * 1000)
      : null,
    end: item.current_period_end
      ? new Date(item.current_period_end * 1000)
      : null,
  };
}

/** Extract subscription ID from an Invoice (Stripe v20 uses parent.subscription_details) */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details;
  if (!details) return null;
  const sub = (details as { subscription?: string | Stripe.Subscription })
    .subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

/** Fetch email + locale for a user — used for transactional emails */
async function getUserEmailLocale(
  userId: string,
): Promise<{ email: string; locale: "en" | "fr" }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, metadata: true },
  });
  const meta = (user?.metadata ?? {}) as Record<string, unknown>;
  const locale = meta.locale === "fr" ? "fr" : "en";
  return { email: user?.email ?? "", locale };
}

const PLAN_ORDER: Record<string, number> = {
  FREE: 0,
  PRO: 1,
  TEAM: 2,
  ENTERPRISE: 3,
};

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: create StripeEvent record; skip if already processed
  try {
    await prisma.stripeEvent.create({
      data: {
        id: event.id,
        type: event.type,
        processed: false,
        payload: event as object,
      },
    });
  } catch {
    // Unique constraint violation = duplicate event — return 200 silently
    return NextResponse.json({ received: true });
  }

  try {
    await handleEvent(event);
    await prisma.stripeEvent.update({
      where: { id: event.id },
      data: { processed: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.stripeEvent.update({
      where: { id: event.id },
      data: { error: message },
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ─── Event dispatcher ─────────────────────────────────────────────────────────

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
      );
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;
    case "customer.subscription.trial_will_end":
      await handleTrialWillEnd(event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }
}

// ─── checkout.session.completed ──────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const clerkUserId = session.client_reference_id;
  if (!clerkUserId) return;

  const user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
  });
  if (!user) return;

  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : ((session.subscription as Stripe.Subscription | null)?.id ?? null);
  if (!stripeSubscriptionId) return;

  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : ((session.customer as Stripe.Customer | null)?.id ?? null);
  if (!stripeCustomerId) return;

  const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const priceId = stripeSub.items.data[0]?.price.id ?? "";
  const newPlanType = await planTypeFromPriceId(priceId);
  const plan = await prisma.plan.findUnique({ where: { name: newPlanType } });
  if (!plan) return;

  // Extract metered and seat item IDs
  let stripeMeteredItemId: string | null = null;
  let stripeSeatsItemId: string | null = null;
  for (const item of stripeSub.items.data) {
    const recurring = item.price.recurring;
    if (recurring?.usage_type === "metered") {
      stripeMeteredItemId = item.id;
    } else if (item.price.id !== priceId) {
      stripeSeatsItemId = item.id;
    }
  }

  const { start, end } = getPeriodDates(stripeSub);
  const previousPlan = user.plan;

  await prisma.$transaction([
    prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        planId: plan.id,
        stripeCustomerId,
        stripeSubscriptionId,
        stripePriceId: priceId,
        stripeMeteredItemId,
        stripeSeatsItemId,
        status: "ACTIVE",
        currentPeriodStart: start,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      },
      create: {
        userId: user.id,
        planId: plan.id,
        stripeCustomerId,
        stripeSubscriptionId,
        stripePriceId: priceId,
        stripeMeteredItemId,
        stripeSeatsItemId,
        status: "ACTIVE",
        currentPeriodStart: start,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
      },
    }),
    prisma.user.update({ where: { id: user.id }, data: { plan: newPlanType } }),
  ]);

  await invalidatePlanCache(newPlanType);
  await logAudit({
    userId: user.id,
    actorId: user.id, // user initiated via checkout
    resource: "billing",
    action: "billing.subscription_activated",
    resourceId: stripeSubscriptionId,
    newValue: { plan: newPlanType, priceId },
    success: true,
  });

  dispatchWebhook(user.id, "billing.plan_upgraded", {
    previous_plan: previousPlan,
    new_plan: newPlanType,
    subscription_id: stripeSubscriptionId,
  });

  try {
    const { email, locale } = await getUserEmailLocale(user.id);
    if (email) {
      const planDisplayName =
        newPlanType.charAt(0) + newPlanType.slice(1).toLowerCase();
      const result = await sendBillingUpgradeEmail(
        email,
        planDisplayName,
        locale,
      );
      if (!result.success)
        console.error(
          `[billing email] Upgrade email failed for ${email}:`,
          result.error,
        );
      else
        console.log(
          `[billing email] Upgrade email sent to ${email} (${planDisplayName})`,
        );
    } else {
      console.error(
        `[billing email] No email for user ${user.id} — upgrade email skipped`,
      );
    }
  } catch (err) {
    console.error(
      `[billing email] Upgrade email threw for user ${user.id}:`,
      err,
    );
  }
}

// ─── customer.subscription.updated ───────────────────────────────────────────

async function handleSubscriptionUpdated(stripeSub: Stripe.Subscription) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSub.id },
    include: { user: true },
  });
  if (!subscription) return;

  const priceId = stripeSub.items.data[0]?.price.id ?? "";
  const newPlanType = await planTypeFromPriceId(priceId);
  const plan = await prisma.plan.findUnique({ where: { name: newPlanType } });
  if (!plan) return;

  const previousPlan = subscription.user.plan;
  const isTrialing = stripeSub.status === "trialing";
  const newStatus = mapStripeStatus(stripeSub.status);
  const { start, end } = getPeriodDates(stripeSub);
  // Capture BEFORE the transaction overwrites it
  const prevCancelAtPeriodEnd = subscription.cancelAtPeriodEnd;

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        planId: plan.id,
        stripePriceId: priceId,
        status: newStatus,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        trialEnd: stripeSub.trial_end
          ? new Date(stripeSub.trial_end * 1000)
          : null,
      },
    }),
    prisma.user.update({
      where: { id: subscription.userId },
      data: { plan: newPlanType },
    }),
  ]);

  await invalidatePlanCache(newPlanType);
  await invalidatePlanCache(previousPlan);
  await logAudit({
    userId: subscription.userId,
    resource: "billing",
    action: "billing.subscription_updated",
    resourceId: stripeSub.id,
    oldValue: { plan: previousPlan },
    newValue: { plan: newPlanType, status: newStatus },
    success: true,
  });

  if (isTrialing) {
    dispatchWebhook(subscription.userId, "billing.trial_started", {
      plan: newPlanType,
      trial_end: stripeSub.trial_end
        ? new Date(stripeSub.trial_end * 1000).toISOString()
        : null,
    });
  } else if ((PLAN_ORDER[newPlanType] ?? 0) > (PLAN_ORDER[previousPlan] ?? 0)) {
    dispatchWebhook(subscription.userId, "billing.plan_upgraded", {
      previous_plan: previousPlan,
      new_plan: newPlanType,
      subscription_id: stripeSub.id,
    });
  } else if ((PLAN_ORDER[newPlanType] ?? 0) < (PLAN_ORDER[previousPlan] ?? 0)) {
    dispatchWebhook(subscription.userId, "billing.plan_downgraded", {
      previous_plan: previousPlan,
      new_plan: newPlanType,
      subscription_id: stripeSub.id,
    });
  }

  // ── Cancellation scheduled ────────────────────────────────────────────────────────────────────────────
  // Stripe uses cancel_at_period_end for paid subs, cancel_at for trials
  const isCancellationScheduled =
    stripeSub.cancel_at_period_end || !!stripeSub.cancel_at;
  const prevIsCancellationScheduled = prevCancelAtPeriodEnd;
  const accessUntil =
    end ?? (stripeSub.cancel_at ? new Date(stripeSub.cancel_at * 1000) : null);
  if (!prevIsCancellationScheduled && isCancellationScheduled && accessUntil) {
    await logAudit({
      userId: subscription.userId,
      resource: "billing",
      action: "billing.subscription_cancellation_scheduled",
      resourceId: stripeSub.id,
      newValue: { plan: newPlanType, access_until: accessUntil.toISOString() },
      success: true,
    });

    dispatchWebhook(
      subscription.userId,
      "billing.subscription_cancellation_scheduled",
      {
        plan: newPlanType,
        access_until: accessUntil.toISOString(),
        subscription_id: stripeSub.id,
      },
    );

    try {
      const { email, locale } = await getUserEmailLocale(subscription.userId);
      if (email) {
        const planDisplayName =
          newPlanType.charAt(0) + newPlanType.slice(1).toLowerCase();
        const result = await sendBillingCancellationEmail(
          email,
          planDisplayName,
          accessUntil,
          locale,
        );
        if (!result.success)
          console.error(
            `[billing email] Cancellation email failed for ${email}:`,
            result.error,
          );
        else
          console.log(
            `[billing email] Cancellation email sent to ${email} (${planDisplayName})`,
          );
      } else {
        console.error(
          `[billing email] No email for user ${subscription.userId} — cancellation email skipped`,
        );
      }
    } catch (err) {
      console.error(
        `[billing email] Cancellation email threw for user ${subscription.userId}:`,
        err,
      );
    }
  }
}

// ─── customer.subscription.deleted ───────────────────────────────────────────

async function handleSubscriptionDeleted(stripeSub: Stripe.Subscription) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSub.id },
    include: { user: true },
  });
  if (!subscription) return;

  const freePlan = await prisma.plan.findUnique({ where: { name: "FREE" } });
  if (!freePlan) return;

  const previousPlan = subscription.user.plan;

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "CANCELED", canceledAt: new Date(), planId: freePlan.id },
    }),
    prisma.user.update({
      where: { id: subscription.userId },
      data: { plan: "FREE" },
    }),
  ]);

  await invalidatePlanCache(previousPlan);
  await logAudit({
    userId: subscription.userId,
    resource: "billing",
    action: "billing.subscription_canceled",
    resourceId: stripeSub.id,
    oldValue: { plan: previousPlan },
    newValue: { plan: "FREE" },
    success: true,
  });
  await logAudit({
    userId: subscription.userId,
    resource: "billing",
    action: "billing.plan_downgraded",
    resourceId: stripeSub.id,
    oldValue: { plan: previousPlan },
    newValue: { plan: "FREE" },
    success: true,
  });

  dispatchWebhook(subscription.userId, "billing.plan_downgraded", {
    previous_plan: previousPlan,
    new_plan: "FREE",
    subscription_id: stripeSub.id,
  });

  try {
    const { email, locale } = await getUserEmailLocale(subscription.userId);
    if (email) {
      const result = await sendBillingDowngradeEmail(email, [], locale);
      if (!result.success)
        console.error(
          `[billing email] Downgrade email failed for ${email}:`,
          result.error,
        );
      else console.log(`[billing email] Downgrade email sent to ${email}`);
    } else {
      console.error(
        `[billing email] No email for user ${subscription.userId} — downgrade email skipped`,
      );
    }
  } catch (err) {
    console.error(
      `[billing email] Downgrade email threw for user ${subscription.userId}:`,
      err,
    );
  }
}

// ─── invoice.payment_failed ───────────────────────────────────────────────────

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const stripeSubId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubId) return;

  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSubId },
  });
  if (!subscription) return;

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "PAST_DUE" },
  });

  await logAudit({
    userId: subscription.userId,
    resource: "billing",
    action: "billing.payment_failed",
    resourceId: stripeSubId,
    newValue: { invoice_id: invoice.id },
    success: false,
  });

  dispatchWebhook(subscription.userId, "billing.payment_failed", {
    subscription_id: stripeSubId,
    invoice_id: invoice.id,
  });

  try {
    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/billing`;
    const { email, locale } = await getUserEmailLocale(subscription.userId);
    if (email) {
      const result = await sendBillingPaymentFailedEmail(
        email,
        portalUrl,
        locale,
      );
      if (!result.success)
        console.error(
          `[billing email] Payment failed email failed for ${email}:`,
          result.error,
        );
      else console.log(`[billing email] Payment failed email sent to ${email}`);
    } else {
      console.error(
        `[billing email] No email for user ${subscription.userId} — payment failed email skipped`,
      );
    }
  } catch (err) {
    console.error(
      `[billing email] Payment failed email threw for user ${subscription.userId}:`,
      err,
    );
  }
}

// ─── invoice.payment_succeeded ────────────────────────────────────────────────

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const stripeSubId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubId) return;

  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSubId },
  });
  if (!subscription) return;

  const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
  const priceId = stripeSub.items.data[0]?.price.id ?? "";
  const planType = await planTypeFromPriceId(priceId);
  const plan = await prisma.plan.findUnique({ where: { name: planType } });
  const { start, end } = getPeriodDates(stripeSub);

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        currentPeriodStart: start,
        currentPeriodEnd: end,
        status: "ACTIVE",
        ...(plan ? { planId: plan.id } : {}),
      },
    }),
    prisma.user.update({
      where: { id: subscription.userId },
      data: { plan: planType },
    }),
  ]);

  const amountDue = (invoice as { amount_due?: number }).amount_due ?? 0;
  const invoicePdf =
    (invoice as { invoice_pdf?: string | null }).invoice_pdf ?? null;
  if (amountDue > 0) {
    try {
      const { email, locale } = await getUserEmailLocale(subscription.userId);
      if (email) {
        const result = await sendBillingReceiptEmail(
          email,
          amountDue,
          invoicePdf,
          locale,
        );
        if (!result.success)
          console.error(
            "[billing email] Receipt email failed for",
            email,
            result.error,
          );
        else
          console.log(
            "[billing email] Receipt email sent to",
            email,
            (amountDue / 100).toFixed(2),
          );
      } else {
        console.error(
          "[billing email] No email for user",
          subscription.userId,
          "— receipt email skipped",
        );
      }
    } catch (err) {
      console.error(
        "[billing email] Receipt email threw for user",
        subscription.userId,
        err,
      );
    }
  }
}

// ─── customer.subscription.trial_will_end ────────────────────────────────────

async function handleTrialWillEnd(stripeSub: Stripe.Subscription) {
  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSub.id },
  });
  if (!subscription) return;

  await logAudit({
    userId: subscription.userId,
    resource: "billing",
    action: "billing.trial_ending",
    resourceId: stripeSub.id,
    newValue: {
      trial_end: stripeSub.trial_end
        ? new Date(stripeSub.trial_end * 1000).toISOString()
        : null,
    },
    success: true,
  });

  dispatchWebhook(subscription.userId, "billing.trial_ending", {
    plan: "PRO",
    trial_end: stripeSub.trial_end
      ? new Date(stripeSub.trial_end * 1000).toISOString()
      : null,
  });

  if (stripeSub.trial_end) {
    const trialEndDate = new Date(stripeSub.trial_end * 1000);
    try {
      const { email, locale } = await getUserEmailLocale(subscription.userId);
      if (email) {
        await sendBillingRenewalReminderEmail(email, trialEndDate, 0, locale);
        console.log("[billing email] Trial ending reminder sent to", email);
      } else {
        console.error(
          "[billing email] No email for user",
          subscription.userId,
          "- trial reminder skipped",
        );
      }
    } catch (err) {
      console.error(
        "[billing email] Trial reminder threw for user",
        subscription.userId,
        err,
      );
    }
  }
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function mapStripeStatus(
  status: Stripe.Subscription.Status,
):
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "PAUSED" {
  const map: Record<
    string,
    | "INCOMPLETE"
    | "INCOMPLETE_EXPIRED"
    | "TRIALING"
    | "ACTIVE"
    | "PAST_DUE"
    | "CANCELED"
    | "UNPAID"
    | "PAUSED"
  > = {
    incomplete: "INCOMPLETE",
    incomplete_expired: "INCOMPLETE_EXPIRED",
    trialing: "TRIALING",
    active: "ACTIVE",
    past_due: "PAST_DUE",
    canceled: "CANCELED",
    unpaid: "UNPAID",
    paused: "PAUSED",
  };
  return map[status] ?? "INCOMPLETE";
}
