import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * POST /api/admin/billing/refund
 * Body: { chargeId: string, amount?: number, reason?: string }
 * Requires billing:write
 */
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canWrite = await hasPermission(currentUser.id, "billing:write");
  if (!canWrite)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── Rate limit: 30 admin actions/min per user ───────────────────────────────
  const rl = await rateLimit(currentUser.id, RATE_LIMITS.admin);
  if (!rl.allowed) return rateLimitResponse(rl);

  const body = (await req.json()) as {
    paymentIntentId: string;
    amount?: number;
    reason?: string;
  };
  const { paymentIntentId, amount, reason } = body;

  if (!paymentIntentId)
    return NextResponse.json(
      { error: "paymentIntentId required" },
      { status: 400 },
    );

  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      ...(amount ? { amount } : {}),
      ...(reason
        ? {
            reason: reason as
              | "duplicate"
              | "fraudulent"
              | "requested_by_customer",
          }
        : {}),
    });

    await logAudit({
      actorId: currentUser.id,
      userId: currentUser.id,
      resource: "billing",
      action: "billing.refund_issued",
      resourceId: paymentIntentId,
      newValue: {
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status,
      },
      success: true,
    });

    return NextResponse.json({ refund });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    await logAudit({
      actorId: currentUser.id,
      userId: currentUser.id,
      resource: "billing",
      action: "billing.refund_issued",
      resourceId: paymentIntentId,
      success: false,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * GET /api/admin/billing/refund?customerId=cus_xxx
 * List refunds for a customer
 */
export async function GET(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canRead = await hasPermission(currentUser.id, "billing:read");
  if (!canRead)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");
  if (!customerId)
    return NextResponse.json({ error: "customerId required" }, { status: 400 });

  try {
    // Get charges for customer, then their refunds
    const charges = await stripe.charges.list({
      customer: customerId,
      limit: 20,
    });
    const refunds = await Promise.all(
      charges.data.map((charge) =>
        stripe.refunds.list({ charge: charge.id, limit: 5 }).then((r) =>
          r.data.map((refund) => ({
            id: refund.id,
            chargeId: charge.id,
            amount: refund.amount,
            currency: refund.currency,
            status: refund.status,
            reason: refund.reason,
            created: refund.created,
          })),
        ),
      ),
    );
    return NextResponse.json({ refunds: refunds.flat() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
