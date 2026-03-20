import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "@/i18n/routing";
import {
  ExternalLink,
  ArrowLeft,
  Calendar,
  CreditCard,
  AlertTriangle,
  UserCheck,
} from "lucide-react";
import { SubscriptionDetailClient } from "@/components/admin/subscription-detail-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; subscriptionId: string }>;
}): Promise<Metadata> {
  const { subscriptionId } = await params;
  return { title: `Subscription ${subscriptionId.slice(0, 12)}…` };
}

const STATUS_STYLE: Record<string, string> = {
  ACTIVE:
    "bg-secondary-500/10 text-secondary-700 border-secondary-500/25 dark:text-secondary-400",
  TRIALING: "bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-400",
  PAST_DUE:
    "bg-error-500/10 text-error-700 border-error-500/25 dark:text-error-400",
  CANCELED: "bg-muted text-muted-foreground border-border",
  PAUSED:
    "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-400",
  INCOMPLETE: "bg-muted text-muted-foreground border-border",
  INCOMPLETE_EXPIRED: "bg-muted text-muted-foreground border-border",
  UNPAID:
    "bg-error-500/10 text-error-700 border-error-500/25 dark:text-error-400",
};

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ locale: string; subscriptionId: string }>;
}) {
  const { locale, subscriptionId } = await params;
  const t = await getTranslations({ locale, namespace: "adminBilling" });

  const currentUser = await getCurrentUser();
  const canWrite = currentUser
    ? await hasPermission(currentUser.id, "billing:write")
    : false;

  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          plan: true,
          createdAt: true,
        },
      },
    },
  });

  if (!sub) notFound();

  // Fetch Stripe invoices — fail-open
  let invoices: {
    id: string;
    number: string | null;
    created: number;
    amount_due: number;
    amount_paid: number;
    currency: string;
    status: string | null;
    invoice_pdf: string | null;
    paymentIntentId: string | null;
  }[] = [];

  if (sub.stripeCustomerId) {
    try {
      const stripeInvoices = await stripe.invoices.list({
        customer: sub.stripeCustomerId,
        limit: 24,
        expand: ["data.payments"],
      });
      invoices = stripeInvoices.data.map((inv) => {
        const firstPayment = inv.payments?.data?.[0];
        const piField = (
          firstPayment?.payment as
            | { payment_intent?: string | { id: string } }
            | undefined
        )?.payment_intent;
        const paymentIntentId =
          typeof piField === "string" ? piField : (piField?.id ?? null);
        return {
          id: inv.id,
          number: inv.number,
          created: inv.created,
          amount_due: inv.amount_due,
          amount_paid: inv.amount_paid,
          currency: inv.currency,
          status: inv.status,
          invoice_pdf: inv.invoice_pdf ?? null,
          paymentIntentId,
        };
      });
    } catch {
      // fail-open
    }
  }

  // Audit history for this subscription
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { resourceId: subscriptionId },
        { userId: sub.userId, action: { startsWith: "billing." } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const initials = (sub.user.name ?? sub.user.email)
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Compute total paid across all invoices
  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.amount_paid, 0);

  const currency = invoices[0]?.currency ?? "usd";

  function fmtAmount(cents: number) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(cents / 100);
  }

  const customerDaysAgo = Math.floor(
    (new Date().getTime() - new Date(sub.user.createdAt).getTime()) /
      (1000 * 60 * 60 * 24),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Back nav */}
      <Link
        href="/admin/billing"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="size-3.5" />
        {t("detail.backToBilling")}
      </Link>

      {/* Hero header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <Avatar className="size-12 shrink-0">
          {sub.user.avatarUrl && (
            <AvatarImage src={sub.user.avatarUrl} alt={sub.user.name ?? ""} />
          )}
          <AvatarFallback className="text-sm font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight truncate">
              {sub.user.name ?? sub.user.email}
            </h1>
            <Badge
              variant="outline"
              className={`text-[10px] font-semibold uppercase tracking-wider h-5 px-1.5 ${STATUS_STYLE[sub.status] ?? STATUS_STYLE.CANCELED}`}
            >
              {sub.status}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] font-semibold uppercase tracking-wider h-5 px-1.5"
            >
              {sub.user.plan}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {sub.user.email}
          </p>
          {sub.stripeCustomerId && (
            <p className="font-mono text-[11px] text-muted-foreground/60 mt-0.5">
              {sub.stripeCustomerId}
            </p>
          )}
        </div>

        {canWrite && sub.stripeSubscriptionId && (
          <a
            href={`https://dashboard.stripe.com/subscriptions/${sub.stripeSubscriptionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded-md px-3 py-1.5 shrink-0 self-start"
          >
            <ExternalLink className="size-3.5" />
            Stripe
          </a>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Current period */}
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t("detail.currentPeriod")}
            </span>
            <div className="size-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Calendar className="size-3.5 text-primary" />
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums leading-tight">
              {sub.currentPeriodEnd
                ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                : "—"}
            </p>
            {sub.currentPeriodEnd && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {new Date(sub.currentPeriodEnd) > new Date()
                  ? t("detail.periodActive")
                  : t("detail.periodExpired")}
              </p>
            )}
          </div>
        </div>

        {/* Total paid */}
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t("detail.totalPaid")}
            </span>
            <div className="size-7 rounded-md bg-secondary-500/10 flex items-center justify-center shrink-0">
              <CreditCard className="size-3.5 text-secondary-600 dark:text-secondary-400" />
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums leading-tight">
              {fmtAmount(totalPaid)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {invoices.filter((i) => i.status === "paid").length}{" "}
              {t("detail.invoicesPaid")}
            </p>
          </div>
        </div>

        {/* Cancel at period end */}
        <div
          className={`rounded-lg border bg-card p-4 flex flex-col gap-3 ${sub.cancelAtPeriodEnd ? "border-amber-500/30" : "border-border"}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t("detail.cancelAtPeriodEnd")}
            </span>
            <div
              className={`size-7 rounded-md flex items-center justify-center shrink-0 ${sub.cancelAtPeriodEnd ? "bg-amber-500/10" : "bg-muted"}`}
            >
              <AlertTriangle
                className={`size-3.5 ${sub.cancelAtPeriodEnd ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
              />
            </div>
          </div>
          <div>
            <p
              className={`text-lg font-semibold leading-tight ${sub.cancelAtPeriodEnd ? "text-amber-600 dark:text-amber-400" : ""}`}
            >
              {sub.cancelAtPeriodEnd ? t("detail.yes") : t("detail.no")}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {sub.cancelAtPeriodEnd
                ? t("detail.willCancel")
                : t("detail.autoRenews")}
            </p>
          </div>
        </div>

        {/* Customer since */}
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t("detail.customerSince")}
            </span>
            <div className="size-7 rounded-md bg-sky-500/10 flex items-center justify-center shrink-0">
              <UserCheck className="size-3.5 text-sky-600 dark:text-sky-400" />
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums leading-tight">
              {new Date(sub.user.createdAt).toLocaleDateString()}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {customerDaysAgo} {t("detail.daysAgo")}
            </p>
          </div>
        </div>
      </div>

      {/* Client component: invoices + refund actions + audit */}
      <SubscriptionDetailClient
        subscriptionId={subscriptionId}
        stripeCustomerId={sub.stripeCustomerId}
        stripeSubscriptionId={sub.stripeSubscriptionId}
        invoices={invoices}
        auditLogs={auditLogs.map((l) => ({
          id: l.id,
          action: l.action,
          actorId: l.actorId,
          success: l.success,
          error: l.error,
          createdAt: l.createdAt.toISOString(),
        }))}
        canWrite={canWrite}
      />
    </div>
  );
}
