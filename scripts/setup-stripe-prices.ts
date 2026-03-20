/**
 * setup-stripe-prices.ts
 *
 * Creates all required Stripe products and prices for GateCtr.
 * Run once: pnpm stripe:setup
 *
 * Features:
 * - USD base currency (Stripe Adaptive Pricing converts to local currency automatically)
 * - tax_behavior: "inclusive" — displayed price already includes tax
 * - Stripe Tax handles VAT/GST/sales tax per territory automatically
 *
 * Prerequisites (enable in Stripe Dashboard before running):
 * 1. Stripe Tax: Settings → Tax → Enable
 * 2. Adaptive Pricing: Settings → Billing → Adaptive pricing → Enable
 *
 * Outputs the price IDs to copy into .env.local
 */

import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY is not set");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
});

// tax_behavior: "inclusive" — price shown to customer already includes tax.
// Stripe Tax will extract and remit the correct amount per territory.
const TAX_BEHAVIOR = "inclusive" as const;

async function main() {
  console.log("🚀 Setting up Stripe products and prices...\n");
  console.log(
    "ℹ️  Prices use tax_behavior=inclusive — displayed price includes tax.",
  );
  console.log(
    "ℹ️  Enable Stripe Tax + Adaptive Pricing in your Dashboard first.\n",
  );

  // ── PRO Plan ────────────────────────────────────────────────────────────────
  const proProd = await stripe.products.create({
    name: "GateCtr Pro",
    description:
      "For developers scaling up. 2M tokens/month, 5 projects, Context Optimizer, Model Router.",
    tax_code: "txcd_10103001", // SaaS — software as a service
    metadata: { plan: "PRO" },
  });

  const proMonthly = await stripe.prices.create({
    product: proProd.id,
    currency: "usd",
    unit_amount: 2900, // $29.00 (tax inclusive)
    tax_behavior: TAX_BEHAVIOR,
    recurring: { interval: "month" },
    nickname: "Pro Monthly",
    metadata: { plan: "PRO", interval: "monthly" },
  });

  const proYearly = await stripe.prices.create({
    product: proProd.id,
    currency: "usd",
    unit_amount: 29000, // $290.00 (~2 months free, tax inclusive)
    tax_behavior: TAX_BEHAVIOR,
    recurring: { interval: "year" },
    nickname: "Pro Yearly",
    metadata: { plan: "PRO", interval: "yearly" },
  });

  // ── TEAM Plan ───────────────────────────────────────────────────────────────
  const teamProd = await stripe.products.create({
    name: "GateCtr Team",
    description:
      "For teams. 10M tokens/month, unlimited projects, RBAC, audit logs. 3 seats included.",
    tax_code: "txcd_10103001",
    metadata: { plan: "TEAM" },
  });

  const teamMonthly = await stripe.prices.create({
    product: teamProd.id,
    currency: "usd",
    unit_amount: 9900, // $99.00 (tax inclusive)
    tax_behavior: TAX_BEHAVIOR,
    recurring: { interval: "month" },
    nickname: "Team Monthly",
    metadata: { plan: "TEAM", interval: "monthly" },
  });

  const teamYearly = await stripe.prices.create({
    product: teamProd.id,
    currency: "usd",
    unit_amount: 99000, // $990.00 (~2 months free, tax inclusive)
    tax_behavior: TAX_BEHAVIOR,
    recurring: { interval: "year" },
    nickname: "Team Yearly",
    metadata: { plan: "TEAM", interval: "yearly" },
  });

  // ── ENTERPRISE Plan ─────────────────────────────────────────────────────────
  const enterpriseProd = await stripe.products.create({
    name: "GateCtr Enterprise",
    description:
      "Unlimited scale. SLA 99.9%, on-premise option, SSO/SAML, dedicated support.",
    tax_code: "txcd_10103001",
    metadata: { plan: "ENTERPRISE" },
  });

  const enterpriseMonthly = await stripe.prices.create({
    product: enterpriseProd.id,
    currency: "usd",
    unit_amount: 0, // Custom — set per deal
    tax_behavior: TAX_BEHAVIOR,
    recurring: { interval: "month" },
    nickname: "Enterprise Monthly",
    metadata: { plan: "ENTERPRISE", interval: "monthly" },
  });

  const enterpriseYearly = await stripe.prices.create({
    product: enterpriseProd.id,
    currency: "usd",
    unit_amount: 0, // Custom — set per deal
    tax_behavior: TAX_BEHAVIOR,
    recurring: { interval: "year" },
    nickname: "Enterprise Yearly",
    metadata: { plan: "ENTERPRISE", interval: "yearly" },
  });

  // ── Seats Add-on (Team) ─────────────────────────────────────────────────────
  const seatsProd = await stripe.products.create({
    name: "GateCtr Additional Seats",
    description:
      "Additional team members beyond the 3 included in the Team plan. $15/seat/month.",
    tax_code: "txcd_10103001",
    metadata: { addon: "seats" },
  });

  const seatsPrice = await stripe.prices.create({
    product: seatsProd.id,
    currency: "usd",
    unit_amount: 1500, // $15.00 per seat (tax inclusive)
    tax_behavior: TAX_BEHAVIOR,
    recurring: {
      interval: "month",
      usage_type: "licensed",
    },
    nickname: "Additional Seat",
    metadata: { addon: "seats" },
  });

  // ── Token Overage Add-on (Pro & Team) ───────────────────────────────────────
  // New API (2025-03-31.basil+): metered prices must be backed by a Meter object
  const overageMeter = await stripe.billing.meters.create({
    display_name: "Token Overage",
    event_name: "token_overage",
    default_aggregation: { formula: "sum" },
    value_settings: { event_payload_key: "value" },
  });

  const overageProd = await stripe.products.create({
    name: "GateCtr Token Overage",
    description:
      "Additional tokens beyond plan limit. Billed per 10M tokens routed.",
    tax_code: "txcd_10103001",
    metadata: { addon: "token_overage" },
  });

  const overagePrice = await stripe.prices.create({
    product: overageProd.id,
    currency: "usd",
    unit_amount: 500, // $5.00 per 10M tokens (tax inclusive)
    tax_behavior: TAX_BEHAVIOR,
    recurring: {
      interval: "month",
      usage_type: "metered",
      meter: overageMeter.id,
    },
    nickname: "Token Overage (per 10M tokens)",
    metadata: { addon: "token_overage" },
  });

  // ── Output ──────────────────────────────────────────────────────────────────
  console.log("✅ All products and prices created!\n");
  console.log("Copy these into your .env.local:\n");
  console.log("# ── Stripe Plans ──────────────────────────────────────────");
  console.log(`STRIPE_PRICE_PRO_MONTHLY="${proMonthly.id}"`);
  console.log(`STRIPE_PRICE_PRO_YEARLY="${proYearly.id}"`);
  console.log(`STRIPE_PRICE_TEAM_MONTHLY="${teamMonthly.id}"`);
  console.log(`STRIPE_PRICE_TEAM_YEARLY="${teamYearly.id}"`);
  console.log(`STRIPE_PRICE_ENTERPRISE_MONTHLY="${enterpriseMonthly.id}"`);
  console.log(`STRIPE_PRICE_ENTERPRISE_YEARLY="${enterpriseYearly.id}"`);
  console.log("\n# ── Stripe Add-ons ────────────────────────────────────────");
  console.log(`STRIPE_PRICE_SEATS_ADDON="${seatsPrice.id}"`);
  console.log(`STRIPE_PRICE_TOKEN_OVERAGE="${overagePrice.id}"`);
  console.log("\n# ── Stripe Products ───────────────────────────────────────");
  console.log(`STRIPE_PRODUCT_PRO_ID="${proProd.id}"`);
  console.log(`STRIPE_PRODUCT_TEAM_ID="${teamProd.id}"`);
  console.log(`STRIPE_PRODUCT_ENTERPRISE_ID="${enterpriseProd.id}"`);
  console.log(`STRIPE_PRODUCT_SEATS_ID="${seatsProd.id}"`);
  console.log(`STRIPE_PRODUCT_TOKEN_OVERAGE_ID="${overageProd.id}"`);
  console.log("\n✅ Next steps:");
  console.log("  1. Enable Stripe Tax: Dashboard → Settings → Tax");
  console.log(
    "  2. Enable Adaptive Pricing: Dashboard → Settings → Billing → Adaptive pricing",
  );
  console.log("  3. Copy the IDs above into .env.local");
  console.log("  4. Run: pnpm prisma db seed");
}

main().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
