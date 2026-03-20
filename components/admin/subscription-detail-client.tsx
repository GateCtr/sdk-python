"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataPagination } from "@/components/ui/data-pagination";
import {
  CheckCircle2,
  XCircle,
  Download,
  RotateCcw,
  FileText,
  History,
} from "lucide-react";
import type { Invoice, AuditEntry } from "@/types/billing";

const PAGE_SIZE = 8;
const ACTION_LABELS: Record<string, string> = {
  "billing.subscription_created": "Subscription created",
  "billing.subscription_updated": "Subscription updated",
  "billing.subscription_canceled": "Subscription canceled",
  "billing.subscription_cancellation_scheduled": "Cancellation scheduled",
  "billing.subscription_reactivated": "Subscription reactivated",
  "billing.subscription_paused": "Subscription paused",
  "billing.subscription_resumed": "Subscription resumed",
  "billing.trial_started": "Trial started",
  "billing.trial_ended": "Trial ended",
  "billing.payment_succeeded": "Payment succeeded",
  "billing.payment_failed": "Payment failed",
  "billing.invoice_paid": "Invoice paid",
  "billing.invoice_voided": "Invoice voided",
  "billing.refund_issued": "Refund issued",
  "billing.plan_upgraded": "Plan upgraded",
  "billing.plan_downgraded": "Plan downgraded",
  "billing.coupon_applied": "Coupon applied",
};

function formatAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Fallback: strip prefix, replace underscores, capitalize
  return action
    .replace(/^billing\./, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  subscriptionId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  invoices: Invoice[];
  auditLogs: AuditEntry[];
  canWrite: boolean;
}

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

const INVOICE_STATUS_STYLE: Record<string, string> = {
  paid: "bg-secondary-500/10 text-secondary-700 border-secondary-500/25 dark:text-secondary-400",
  open: "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-400",
  void: "bg-muted text-muted-foreground border-border",
  draft: "bg-muted text-muted-foreground border-border",
  uncollectible:
    "bg-error-500/10 text-error-700 border-error-500/25 dark:text-error-400",
};

export function SubscriptionDetailClient({
  invoices,
  auditLogs,
  canWrite,
}: Props) {
  const t = useTranslations("adminBilling");

  // Pagination state
  const [invoicePage, setInvoicePage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);

  // Refund state
  const [refundTarget, setRefundTarget] = useState<Invoice | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("requested_by_customer");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );

  // Sliced data
  const invoiceTotalPages = Math.ceil(invoices.length / PAGE_SIZE);
  const pagedInvoices = invoices.slice(
    (invoicePage - 1) * PAGE_SIZE,
    invoicePage * PAGE_SIZE,
  );

  const auditTotalPages = Math.ceil(auditLogs.length / PAGE_SIZE);
  const pagedAudit = auditLogs.slice(
    (auditPage - 1) * PAGE_SIZE,
    auditPage * PAGE_SIZE,
  );

  function openRefund(inv: Invoice) {
    setRefundTarget(inv);
    setRefundAmount((inv.amount_paid / 100).toFixed(2));
    setRefundReason("requested_by_customer");
    setFeedback(null);
  }

  function submitRefund() {
    if (!refundTarget?.paymentIntentId) return;
    startTransition(async () => {
      const amountCents = Math.round(parseFloat(refundAmount) * 100);
      const res = await fetch("/api/admin/billing/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIntentId: refundTarget.paymentIntentId,
          amount: amountCents,
          reason: refundReason,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        setFeedback({ ok: true, msg: t("detail.refundSuccess") });
        setRefundTarget(null);
      } else {
        setFeedback({ ok: false, msg: data.error ?? t("detail.refundError") });
      }
    });
  }

  const paginationBase = {
    previous: t("pagination.previous"),
    next: t("pagination.next"),
    morePages: t("pagination.morePages"),
    goPrevious: t("pagination.goPrevious"),
    goNext: t("pagination.goNext"),
  };

  function showingLabel(page: number, total: number) {
    const from = (page - 1) * PAGE_SIZE + 1;
    const to = Math.min(page * PAGE_SIZE, total);
    return `${t("pagination.showing_prefix")} ${from}–${to} ${t("pagination.showing_of")} ${total}`;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
            feedback.ok
              ? "border-secondary-500/25 bg-secondary-500/10 text-secondary-700 dark:text-secondary-400"
              : "border-error-500/25 bg-error-500/10 text-error-700 dark:text-error-400"
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <XCircle className="size-4 shrink-0" />
          )}
          {feedback.msg}
        </div>
      )}

      {/* Two-column layout on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Invoices */}
        <Card className="lg:col-span-3 gap-0 py-0">
          <CardHeader className="border-b border-border px-5 py-3.5">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="size-4 text-muted-foreground" />
              {t("detail.invoices")}
              {invoices.length > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
                  {invoices.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-xs">
                      {t("detail.invoiceNumber")}
                    </TableHead>
                    <TableHead className="text-xs">
                      {t("detail.date")}
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      {t("detail.amount")}
                    </TableHead>
                    <TableHead className="text-xs">
                      {t("detail.status")}
                    </TableHead>
                    <TableHead className="text-xs text-right">
                      {t("detail.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-20 text-center text-sm text-muted-foreground"
                      >
                        {t("detail.noInvoices")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-[11px] text-muted-foreground py-2.5">
                          {inv.number ?? inv.id.slice(0, 10) + "…"}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground py-2.5 whitespace-nowrap">
                          {new Date(inv.created * 1000).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums font-medium text-right py-2.5">
                          {fmt(inv.amount_paid, inv.currency)}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase tracking-wider px-1.5 ${INVOICE_STATUS_STYLE[inv.status ?? ""] ?? INVOICE_STATUS_STYLE.void}`}
                          >
                            {inv.status ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            {inv.invoice_pdf && (
                              <a
                                href={inv.invoice_pdf}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <Download className="size-3" />
                                PDF
                              </a>
                            )}
                            {canWrite &&
                              inv.paymentIntentId &&
                              inv.amount_paid > 0 &&
                              inv.status === "paid" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                                  onClick={() => openRefund(inv)}
                                >
                                  <RotateCcw className="size-3" />
                                  {t("detail.refund")}
                                </Button>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {invoiceTotalPages > 1 && (
              <div className="border-t border-border px-4">
                <DataPagination
                  page={invoicePage}
                  totalPages={invoiceTotalPages}
                  total={invoices.length}
                  pageSize={PAGE_SIZE}
                  labels={{
                    ...paginationBase,
                    showing: showingLabel(invoicePage, invoices.length),
                  }}
                  onPageChange={setInvoicePage}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audit log */}
        <Card className="lg:col-span-2 gap-0 py-0">
          <CardHeader className="border-b border-border px-5 py-3.5">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <History className="size-4 text-muted-foreground" />
              {t("detail.history")}
              {auditLogs.length > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
                  {auditLogs.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pagedAudit.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
                {t("events.empty")}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {pagedAudit.map((log) => (
                  <li key={log.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="mt-0.5 shrink-0">
                      {log.success ? (
                        <CheckCircle2 className="size-3.5 text-secondary-500" />
                      ) : (
                        <XCircle className="size-3.5 text-error-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-foreground truncate">
                        {formatAction(log.action)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {log.actorId ? (
                          log.actorId.slice(0, 14) + "…"
                        ) : (
                          <span className="italic">system</span>
                        )}
                      </p>
                      {!log.success && log.error && (
                        <p className="text-[11px] text-error-600 dark:text-error-400 mt-0.5 truncate">
                          {log.error}
                        </p>
                      )}
                    </div>
                    <time className="text-[10px] text-muted-foreground/60 tabular-nums whitespace-nowrap shrink-0 mt-0.5">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
            {auditTotalPages > 1 && (
              <div className="border-t border-border">
                <DataPagination
                  page={auditPage}
                  totalPages={auditTotalPages}
                  total={auditLogs.length}
                  pageSize={PAGE_SIZE}
                  labels={{
                    ...paginationBase,
                    showing: showingLabel(auditPage, auditLogs.length),
                  }}
                  onPageChange={setAuditPage}
                  compact
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Refund dialog */}
      <Dialog
        open={!!refundTarget}
        onOpenChange={(open) => !open && setRefundTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("detail.issueRefund")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="refund-amount">{t("detail.refundAmount")}</Label>
              <Input
                id="refund-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
              {refundTarget && (
                <p className="text-xs text-muted-foreground">
                  {t("detail.maxRefund")}:{" "}
                  {fmt(refundTarget.amount_paid, refundTarget.currency)}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="refund-reason">{t("detail.refundReason")}</Label>
              <Select value={refundReason} onValueChange={setRefundReason}>
                <SelectTrigger id="refund-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="requested_by_customer">
                    {t("detail.reasonCustomer")}
                  </SelectItem>
                  <SelectItem value="duplicate">
                    {t("detail.reasonDuplicate")}
                  </SelectItem>
                  <SelectItem value="fraudulent">
                    {t("detail.reasonFraudulent")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {feedback && !feedback.ok && (
              <p className="text-sm text-error-600 dark:text-error-400">
                {feedback.msg}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRefundTarget(null)}
              disabled={isPending}
            >
              {t("detail.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={submitRefund}
              disabled={isPending || !refundAmount}
            >
              {isPending ? t("detail.processing") : t("detail.confirmRefund")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
