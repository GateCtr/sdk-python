"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/routing";
import { useActiveTeam } from "@/hooks/use-active-team";
import { useUsageSummary } from "@/hooks/use-usage-summary";
import { NotificationPanel } from "@/components/dashboard/notification-panel";
import { Zap, ChevronRight, ArrowUpCircle } from "lucide-react";

// ─── Breadcrumb map ───────────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "dashboard",
  "/analytics": "analytics",
  "/projects": "projects",
  "/api-keys": "apiKeys",
  "/budget": "budget",
  "/webhooks": "webhooks",
  "/billing": "billing",
  "/settings": "settings",
};

function useBreadcrumb() {
  const pathname = usePathname();
  // strip locale prefix
  const clean = pathname.replace(/^\/fr/, "") || "/";

  const segments = Object.entries(ROUTE_LABELS)
    .filter(
      ([route]) =>
        clean === route || (route !== "/dashboard" && clean.startsWith(route)),
    )
    .sort((a, b) => b[0].length - a[0].length);

  return segments[0] ?? null;
}

// ─── Token usage pill ─────────────────────────────────────────────────────────

function TokenUsagePill() {
  const t = useTranslations("dashboard.header");
  const { data, isLoading } = useUsageSummary();

  if (isLoading || !data) {
    return (
      <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 border border-border/60 min-w-[120px] h-[42px] animate-pulse" />
    );
  }

  const { tokensUsed, tokensLimit, plan } = data;
  const upper = plan.toUpperCase();
  const pct = tokensLimit
    ? Math.min(Math.round((tokensUsed / tokensLimit) * 100), 100)
    : 0;

  const color =
    pct >= 90
      ? "bg-error-500"
      : pct >= 70
        ? "bg-warning-500"
        : "bg-secondary-500";

  const limitLabel =
    upper === "ENTERPRISE" || tokensLimit === null
      ? t("unlimited")
      : tokensLimit >= 1_000_000
        ? `${tokensLimit / 1_000_000}M`
        : `${tokensLimit / 1_000}K`;

  const usedLabel =
    tokensUsed >= 1_000_000
      ? `${(tokensUsed / 1_000_000).toFixed(1)}M`
      : tokensUsed >= 1_000
        ? `${(tokensUsed / 1_000).toFixed(1)}K`
        : tokensUsed.toLocaleString();

  return (
    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 border border-border/60">
      <div className="flex flex-col gap-1 min-w-[80px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium text-muted-foreground">
            {t("tokens")}
          </span>
          <span className="text-[11px] font-semibold tabular-nums">
            {usedLabel}{" "}
            <span className="text-muted-foreground font-normal">
              / {limitLabel}
            </span>
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1 w-full rounded-full bg-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main header ──────────────────────────────────────────────────────────────

export function DashboardHeader() {
  const t = useTranslations("dashboard");
  const breadcrumb = useBreadcrumb();
  const { activeTeam, isLoading } = useActiveTeam();
  const { data: usage } = useUsageSummary();

  // Use usage summary plan as source of truth (reflects latest subscription state)
  const plan = usage?.plan ?? activeTeam?.plan ?? "FREE";
  const isFreePlan = plan.toUpperCase() === "FREE";

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 backdrop-blur-sm px-4 sticky top-0 z-10">
      {/* Mobile trigger */}
      <div className="md:hidden">
        <SidebarTrigger />
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm min-w-0">
        <span className="text-muted-foreground/60 hidden sm:inline">
          GateCtr
        </span>
        {breadcrumb && (
          <>
            <ChevronRight className="size-3.5 text-muted-foreground/40 hidden sm:inline shrink-0" />
            <span className="font-medium text-foreground truncate">
              {t(`sidebar.${breadcrumb[1]}`)}
            </span>
          </>
        )}
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-1.5">
        {/* Token usage — hidden on mobile */}
        {!isLoading && <TokenUsagePill />}

        {/* Upgrade CTA — Free plan only */}
        {!isLoading && isFreePlan && (
          <Button
            asChild
            size="sm"
            variant="cta-accent"
            className="hidden sm:flex h-7 px-2.5 text-xs gap-1.5"
          >
            <Link href="/billing">
              <ArrowUpCircle className="size-3" />
              {t("header.upgrade")}
            </Link>
          </Button>
        )}

        <Separator
          orientation="vertical"
          className="h-5 mx-0.5 hidden sm:block"
        />

        {/* Notifications */}
        <NotificationPanel />

        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
