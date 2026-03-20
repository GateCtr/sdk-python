import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { BillingPageClient } from "@/components/billing/billing-page-client";

// ─── Pure helpers ──────────────────────────────────────────────────────────────

function computeTrialDaysLeft(
  trialEnd: Date | null | undefined,
): number | null {
  if (!trialEnd) return null;
  const msLeft = trialEnd.getTime() - Date.now();
  return Math.max(0, Math.ceil(msLeft / 86400000));
}

export default async function BillingPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const t = await getTranslations("billing");

  const user = await prisma.user.findUnique({
    where: { clerkId },
    include: {
      subscription: { include: { plan: true } },
    },
  });
  if (!user) redirect("/sign-in");

  const sub = user.subscription;

  // ── Usage data ──────────────────────────────────────────────────────────────
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const today = now.toISOString().slice(0, 10);

  const [monthlyAgg, dailyAgg, overageAgg, planLimits] = await Promise.all([
    prisma.dailyUsageCache.aggregate({
      where: { userId: user.id, date: { startsWith: monthStart } },
      _sum: { totalTokens: true },
    }),
    prisma.dailyUsageCache.aggregate({
      where: { userId: user.id, date: today },
      _sum: { totalRequests: true },
    }),
    prisma.dailyUsageCache.aggregate({
      where: { userId: user.id, date: today },
      _sum: { overageTokens: true },
    }),
    prisma.planLimit.findFirst({
      where: { plan: { name: user.plan } },
    }),
  ]);

  // ── Team member count (TEAM plan only) ──────────────────────────────────────
  let teamMemberCount: number | null = null;
  if (user.plan === "TEAM") {
    const team = await prisma.team.findFirst({ where: { ownerId: user.id } });
    if (team) {
      teamMemberCount = await prisma.teamMember.count({
        where: { teamId: team.id },
      });
    }
  }

  // ── Invoices — never throw ──────────────────────────────────────────────────
  type InvoiceShape = {
    id: string;
    created: number;
    amount_due: number;
    currency: string;
    status: string | null;
    invoice_pdf: string | null;
  };
  let invoices: InvoiceShape[] = [];
  if (sub?.stripeCustomerId) {
    try {
      const list = await stripe.invoices.list({
        customer: sub.stripeCustomerId,
        limit: 12,
      });
      invoices = list.data.map((inv) => ({
        id: inv.id,
        created: inv.created,
        amount_due: inv.amount_due,
        currency: inv.currency,
        status: inv.status ?? null,
        invoice_pdf:
          (inv as { invoice_pdf?: string | null }).invoice_pdf ?? null,
      }));
    } catch {
      // fail-open — invoices are non-critical
    }
  }

  // ── Yearly price IDs for interval detection ─────────────────────────────────
  const yearlyPlans = await prisma.plan.findMany({
    where: { stripePriceIdYearly: { not: null } },
    select: { stripePriceIdYearly: true },
  });
  const yearlyPriceIds = yearlyPlans
    .map((p) => p.stripePriceIdYearly)
    .filter(Boolean) as string[];

  const trialDaysLeft = computeTrialDaysLeft(sub?.trialEnd);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t("page.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
      </div>

      <BillingPageClient
        currentPlan={user.plan}
        subscriptionStatus={sub?.status ?? null}
        cancelAtPeriodEnd={sub?.cancelAtPeriodEnd ?? false}
        trialDaysLeft={trialDaysLeft}
        currentPeriodEndStr={sub?.currentPeriodEnd?.toISOString() ?? null}
        stripePriceId={sub?.stripePriceId ?? null}
        stripeCustomerId={sub?.stripeCustomerId ?? null}
        yearlyPriceIds={yearlyPriceIds}
        tokensThisMonth={monthlyAgg._sum.totalTokens ?? 0}
        requestsToday={dailyAgg._sum.totalRequests ?? 0}
        overageTokens={overageAgg._sum.overageTokens ?? 0}
        maxTokensPerMonth={planLimits?.maxTokensPerMonth ?? null}
        maxRequestsPerDay={planLimits?.maxRequestsPerDay ?? null}
        teamMemberCount={teamMemberCount}
        invoices={invoices}
      />
    </div>
  );
}
