import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import type { CouponRow, CreateCouponBody } from "@/types/billing";
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

// ─── GET — list coupons (with their first promo code if any) ──────────────────

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canRead = await hasPermission(currentUser.id, "billing:read");
  if (!canRead)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const [coupons, promoCodes] = await Promise.all([
      stripe.coupons.list({ limit: 100 }),
      stripe.promotionCodes.list({ limit: 100, active: true }),
    ]);

    // Build a map: couponId → first promo code
    const promoMap = new Map<
      string,
      {
        code: string;
        id: string;
        firstTime: boolean;
        minAmount: number | null;
        minCurrency: string | null;
      }
    >();
    for (const p of promoCodes.data) {
      const promo = p.promotion;
      const couponId =
        promo.type === "coupon"
          ? typeof promo.coupon === "string"
            ? promo.coupon
            : (promo.coupon as { id: string }).id
          : null;
      if (couponId && !promoMap.has(couponId)) {
        promoMap.set(couponId, {
          code: p.code,
          id: p.id,
          firstTime: p.restrictions.first_time_transaction,
          minAmount: p.restrictions.minimum_amount ?? null,
          minCurrency: p.restrictions.minimum_amount_currency ?? null,
        });
      }
    }

    return NextResponse.json({
      coupons: coupons.data.map((c): CouponRow => {
        const promo = promoMap.get(c.id);
        return {
          id: c.id,
          name: c.name ?? null,
          percentOff: c.percent_off ?? null,
          amountOff: c.amount_off ?? null,
          currency: c.currency ?? null,
          duration: c.duration,
          durationInMonths: c.duration_in_months ?? null,
          maxRedemptions: c.max_redemptions ?? null,
          timesRedeemed: c.times_redeemed,
          redeemBy: c.redeem_by ?? null,
          valid: c.valid,
          created: c.created,
          promoCode: promo?.code ?? null,
          promoCodeId: promo?.id ?? null,
          firstTimeOnly: promo?.firstTime ?? false,
          minimumAmount: promo?.minAmount ?? null,
          minimumAmountCurrency: promo?.minCurrency ?? null,
        };
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// ─── POST — create coupon + optional promo code ───────────────────────────────

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

  const body = (await req.json()) as CreateCouponBody;

  try {
    // 1. Create the coupon
    const coupon = await stripe.coupons.create({
      ...(body.name ? { name: body.name } : {}),
      ...(body.discountType === "percent" && body.percentOff
        ? { percent_off: body.percentOff }
        : {}),
      ...(body.discountType === "fixed" && body.amountOff
        ? {
            amount_off: Math.round(body.amountOff * 100),
            currency: body.currency ?? "usd",
          }
        : {}),
      duration: body.duration,
      ...(body.duration === "repeating" && body.durationInMonths
        ? { duration_in_months: body.durationInMonths }
        : {}),
      ...(body.maxRedemptions ? { max_redemptions: body.maxRedemptions } : {}),
      ...(body.redeemBy
        ? { redeem_by: Math.floor(new Date(body.redeemBy).getTime() / 1000) }
        : {}),
    });

    // 2. Optionally create a promotion code on top
    let promoCode = null;
    if (
      body.promoCode ||
      body.firstTimeOnly ||
      body.minimumAmount ||
      body.promoMaxRedemptions ||
      body.promoExpiresAt ||
      body.restrictToCustomer
    ) {
      promoCode = await stripe.promotionCodes.create({
        promotion: { type: "coupon" as const, coupon: coupon.id },
        ...(body.promoCode ? { code: body.promoCode } : {}),
        ...(body.promoMaxRedemptions
          ? { max_redemptions: body.promoMaxRedemptions }
          : {}),
        ...(body.promoExpiresAt
          ? {
              expires_at: Math.floor(
                new Date(body.promoExpiresAt).getTime() / 1000,
              ),
            }
          : {}),
        ...(body.restrictToCustomer
          ? { customer: body.restrictToCustomer }
          : {}),
        restrictions: {
          ...(body.firstTimeOnly ? { first_time_transaction: true } : {}),
          ...(body.minimumAmount
            ? {
                minimum_amount: Math.round(body.minimumAmount * 100),
                minimum_amount_currency: body.currency ?? "usd",
              }
            : {}),
        },
      });
    }

    await logAudit({
      actorId: currentUser.id,
      userId: currentUser.id,
      resource: "billing",
      action: "billing.coupon_created",
      resourceId: coupon.id,
      newValue: {
        name: coupon.name,
        percentOff: coupon.percent_off,
        amountOff: coupon.amount_off,
        duration: coupon.duration,
        promoCode: promoCode?.code ?? null,
      },
      success: true,
    });

    const couponRow: CouponRow = {
      id: coupon.id,
      name: coupon.name ?? null,
      percentOff: coupon.percent_off ?? null,
      amountOff: coupon.amount_off ?? null,
      currency: coupon.currency ?? null,
      duration: coupon.duration,
      durationInMonths: coupon.duration_in_months ?? null,
      maxRedemptions: coupon.max_redemptions ?? null,
      timesRedeemed: coupon.times_redeemed,
      redeemBy: coupon.redeem_by ?? null,
      valid: coupon.valid,
      created: coupon.created,
      promoCode: promoCode?.code ?? null,
      promoCodeId: promoCode?.id ?? null,
      firstTimeOnly: promoCode?.restrictions.first_time_transaction ?? false,
      minimumAmount: promoCode?.restrictions.minimum_amount ?? null,
      minimumAmountCurrency:
        promoCode?.restrictions.minimum_amount_currency ?? null,
    };

    return NextResponse.json({
      coupon: couponRow,
      promoCode: promoCode ? { code: promoCode.code, id: promoCode.id } : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// ─── DELETE — deactivate coupon (and its promo codes) ────────────────────────

export async function DELETE(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const canWrite = await hasPermission(currentUser.id, "billing:write");
  if (!canWrite)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const rl = await rateLimit(currentUser.id, RATE_LIMITS.admin);
  if (!rl.allowed) return rateLimitResponse(rl);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const promoId = searchParams.get("promoId");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    // Deactivate promo code first if present
    if (promoId) {
      await stripe.promotionCodes.update(promoId, { active: false });
    }
    await stripe.coupons.del(id);

    await logAudit({
      actorId: currentUser.id,
      userId: currentUser.id,
      resource: "billing",
      action: "billing.coupon_deleted",
      resourceId: id,
      success: true,
    });

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
