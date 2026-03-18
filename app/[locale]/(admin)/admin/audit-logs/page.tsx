import { redirect } from "next/navigation";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { getAuditLogs } from "@/lib/audit";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "admin.metadata.auditLogs",
  });
  return { title: t("title"), description: t("description") };
}

/**
 * Admin Audit Logs Page (Server Component)
 * Requirements: 9.8, 6.7
 */
export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  try {
    await requirePermission("audit:read");
  } catch {
    redirect("/dashboard?error=access_denied");
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const { logs, total } = await getAuditLogs({}, { page, pageSize: 50 });

  return <AuditLogsView logs={logs} total={total} page={page} />;
}

// ─── View ─────────────────────────────────────────────────────────────────────

type AuditLogRow = {
  id: string;
  userId: string | null;
  resource: string;
  action: string;
  success: boolean;
  createdAt: Date;
};

function AuditLogsView({
  logs,
  total,
  page,
}: {
  logs: AuditLogRow[];
  total: number;
  page: number;
}) {
  const t = useTranslations("admin");

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">{t("auditLogs.title")}</h1>
      <p className="text-muted-foreground mb-2">{t("auditLogs.subtitle")}</p>
      <p className="text-sm text-muted-foreground mb-8">
        {total} total entries — page {page}
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {(
                ["timestamp", "user", "resource", "action", "status"] as const
              ).map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs"
                >
                  {t(`auditLogs.table.${col}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {t("auditLogs.empty")}
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {log.userId ?? "—"}
                  </td>
                  <td className="px-4 py-3">{log.resource}</td>
                  <td className="px-4 py-3">{log.action}</td>
                  <td className="px-4 py-3">
                    <Badge variant={log.success ? "default" : "destructive"}>
                      {log.success
                        ? t("auditLogs.status.success")
                        : t("auditLogs.status.failed")}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
