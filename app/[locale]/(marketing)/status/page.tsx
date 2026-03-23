"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

type ServiceStatus = {
  status: string;
  checkedAt: string | null;
};

type HealthResponse = {
  status: string;
  services: Record<string, ServiceStatus>;
};

const SERVICES = ["app", "database", "redis", "queue", "stripe"] as const;

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("status");

  const config: Record<string, { dot: string; bg: string; text: string }> = {
    HEALTHY: {
      dot: "bg-success-500",
      bg: "bg-success-500/10",
      text: "text-success-600 dark:text-success-400",
    },
    DEGRADED: {
      dot: "bg-warning-500",
      bg: "bg-warning-500/10",
      text: "text-warning-600 dark:text-warning-400",
    },
    DOWN: {
      dot: "bg-error-500",
      bg: "bg-error-500/10",
      text: "text-error-600 dark:text-error-400",
    },
  };

  const c = config[status] ?? {
    dot: "bg-muted-foreground",
    bg: "bg-muted",
    text: "text-muted-foreground",
  };

  const label =
    status in (t.raw("status") as Record<string, string>)
      ? t(`status.${status}` as Parameters<typeof t>[0])
      : t("status.unknown");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        c.bg,
        c.text,
      )}
    >
      <span className={cn("size-1.5 rounded-full", c.dot)} />
      {label}
    </span>
  );
}

// ─── Overall banner ───────────────────────────────────────────────────────────

function OverallBanner({ status }: { status: string }) {
  const t = useTranslations("status");

  const config: Record<string, { bg: string; border: string; dot: string }> = {
    healthy: {
      bg: "bg-success-500/10",
      border: "border-success-500/20",
      dot: "bg-success-500",
    },
    degraded: {
      bg: "bg-warning-500/10",
      border: "border-warning-500/20",
      dot: "bg-warning-500",
    },
    down: {
      bg: "bg-error-500/10",
      border: "border-error-500/20",
      dot: "bg-error-500",
    },
  };

  const c = config[status] ?? config.healthy;
  const label =
    status in (t.raw("overall") as Record<string, string>)
      ? t(`overall.${status}` as Parameters<typeof t>[0])
      : t("overall.unknown");

  return (
    <div
      className={cn(
        "rounded-lg border px-5 py-4 flex items-center gap-3",
        c.bg,
        c.border,
      )}
    >
      <span className="relative flex size-3">
        <span
          className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-60",
            c.dot,
          )}
        />
        <span
          className={cn("relative inline-flex rounded-full size-3", c.dot)}
        />
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatusPage() {
  const t = useTranslations("status");
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/system/health");
      if (res.ok) {
        const json = (await res.json()) as HealthResponse;
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    // Auto-refresh every 60s
    const interval = setInterval(() => void fetchHealth(), 60_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight mb-1">
            {t("page.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("page.description")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchHealth()}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          {t("refresh")}
        </Button>
      </div>

      {/* Overall status */}
      <div className="mb-8">
        <OverallBanner status={data?.status ?? "healthy"} />
      </div>

      {/* Services list */}
      <div className="border border-border rounded-lg divide-y divide-border">
        {SERVICES.map((service) => {
          const svc = data?.services[service];
          const checkedAt = svc?.checkedAt ? new Date(svc.checkedAt) : null;

          return (
            <div
              key={service}
              className="flex items-center justify-between px-5 py-4"
            >
              <div>
                <p className="text-sm font-medium">
                  {t(`services.${service}` as Parameters<typeof t>[0])}
                </p>
                {checkedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("lastChecked", {
                      time: checkedAt.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      }),
                    })}
                  </p>
                )}
                {!checkedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("noData")}
                  </p>
                )}
              </div>
              <StatusBadge status={svc?.status ?? "unknown"} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
