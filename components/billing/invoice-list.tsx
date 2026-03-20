"use client";

import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface Invoice {
  id: string;
  created: number; // unix timestamp
  amount_due: number; // cents
  currency: string;
  status: string | null;
  invoice_pdf: string | null;
}

interface InvoiceListProps {
  invoices: Invoice[];
}

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  paid: "default",
  open: "secondary",
  void: "outline",
  uncollectible: "destructive",
};

export function InvoiceList({ invoices }: InvoiceListProps) {
  const t = useTranslations("billing.invoices");

  if (invoices.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                {t("date")}
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                {t("amount")}
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                {t("status")}
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                {t("download")}
              </th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const date = new Date(inv.created * 1000).toLocaleDateString(
                undefined,
                {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                },
              );
              const amount = new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: inv.currency.toUpperCase(),
              }).format(inv.amount_due / 100);
              const status = inv.status ?? "open";
              const statusLabel = t(
                `statuses.${status}` as Parameters<typeof t>[0],
                { default: status },
              );

              return (
                <tr
                  key={inv.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 text-foreground">{date}</td>
                  <td className="px-4 py-3 font-medium text-foreground tabular-nums">
                    {amount}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[status] ?? "outline"}>
                      {statusLabel}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {inv.invoice_pdf ? (
                      <a
                        href={inv.invoice_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Download className="size-3.5" />
                        {t("download")}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
