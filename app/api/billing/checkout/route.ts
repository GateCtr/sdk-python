import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type { PlanType } from "@prisma/client";
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Rate limit: 5 checkout attempts/hour per user ───────────────────────────
  const rl = await rateLimit(userId, RATE_LIMITS.checkout);
  if (!rl.allowed) return rateLimitResponse(rl);

  let body: { planId?: string; interval?: "monthly" | "yearly" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { planId, interval = "monthly" } = body;
  if (!planId) {
    return NextResponse.json({ error: "planId is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: { subscription: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.subscription?.status === "ACTIVE") {
    return NextResponse.json(
      {
        error:
          "Active subscription already exists. Use the billing portal to change plans.",
      },
      { status: 409 },
    );
  }

  // planId is sent as the plan name (e.g. "PRO"), not the DB cuid
  const plan = await prisma.plan.findUnique({
    where: { name: planId as PlanType },
  });
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 400 });
  }

  const priceId =
    interval === "yearly"
      ? plan.stripePriceIdYearly
      : plan.stripePriceIdMonthly;

  if (!priceId) {
    return NextResponse.json(
      { error: "Invalid plan. Plan must have a Stripe price configured." },
      { status: 400 },
    );
  }

  try {
    let stripeCustomerId = user.subscription?.stripeCustomerId ?? null;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({ email: user.email });
      stripeCustomerId = customer.id;
      await prisma.subscription.upsert({
        where: { userId: user.id },
        update: { stripeCustomerId },
        create: { userId: user.id, planId: plan.id, stripeCustomerId },
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const isNewProSubscription =
      plan.name === "PRO" &&
      (!user.subscription ||
        !["ACTIVE", "TRIALING"].includes(user.subscription.status));

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: userId,
      // Stripe Tax: calculates VAT/GST/sales tax per customer territory automatically
      automatic_tax: { enabled: true },
      // Save billing address entered in Checkout back to the Customer (required for automatic_tax)
      customer_update: { address: "auto", name: "auto" },
      // Collect billing address for tax calculation
      billing_address_collection: "required",
      // Adaptive Pricing: Stripe converts USD to customer's local currency
      currency: "usd",
      success_url: `${appUrl}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing`,
      ...(isNewProSubscription
        ? { subscription_data: { trial_period_days: 14 } }
        : {}),
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout session creation failed:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
