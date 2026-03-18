"use client";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/shared/logo";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Github } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FooterVariant = "marketing" | "minimal" | "auth";

export interface FooterProps {
  variant?: FooterVariant;
  className?: string;
}

// ─── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ label }: { label: string }) {
  return (
    <a
      href="https://status.gatectr.com"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      <span className="relative flex size-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-400 opacity-60" />
        <span className="relative inline-flex rounded-full size-2 bg-success-500" />
      </span>
      {label}
    </a>
  );
}

// ─── Social links ─────────────────────────────────────────────────────────────

function SocialLinks({
  githubLabel,
  xLabel,
}: {
  githubLabel: string;
  xLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <a
        href="https://github.com/GateCtr"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={githubLabel}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <Github className="size-4" />
      </a>
      <a
        href="https://x.com/gatectrl"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={xLabel}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {/* X (formerly Twitter) official logo */}
        <svg
          viewBox="0 0 24 24"
          className="size-4 fill-current"
          aria-hidden="true"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

export function Footer({ variant = "marketing", className }: FooterProps) {
  const t = useTranslations("common");
  const year = new Date().getFullYear();

  // Auth footer — Privacy · Terms · Help inline, no distraction
  if (variant === "auth") {
    return (
      <footer className={cn("py-4 px-6", className)}>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            {t("footer.privacy")}
          </Link>
          <span aria-hidden>·</span>
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            {t("footer.terms")}
          </Link>
          <span aria-hidden>·</span>
          <a
            href="mailto:support@gatectr.com"
            className="hover:text-foreground transition-colors"
          >
            {t("footer.help")}
          </a>
          <span aria-hidden>·</span>
          <span>{t("footer.copyright", { year })}</span>
        </div>
      </footer>
    );
  }

  // Minimal footer — one line with logo
  if (variant === "minimal") {
    return (
      <footer
        className={cn("border-t border-border bg-background py-4", className)}
      >
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between text-sm text-muted-foreground">
          <Logo
            variant="full"
            iconClassName="w-5 h-5"
            textClassName="text-base"
          />
          <span>{t("footer.copyright", { year })}</span>
        </div>
      </footer>
    );
  }

  // Marketing footer — full columns
  return (
    <footer className={cn("border-t border-border bg-background", className)}>
      <div className="max-w-7xl mx-auto px-4 py-14">
        {/* Top section */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Brand col */}
          <div className="col-span-2">
            <Logo variant="full" className="mb-4" />
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-5">
              {t("footer.tagline")}
            </p>
            <SocialLinks
              githubLabel={t("footer.githubLabel")}
              xLabel={t("footer.xLabel")}
            />
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold mb-3">
              {t("footer.product")}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/features"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("nav.features")}
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("nav.pricing")}
                </Link>
              </li>
              <li>
                <Link
                  href="/changelog"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footer.changelog")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold mb-3">
              {t("footer.resources")}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://docs.gatectr.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("nav.docs")}
                </a>
              </li>
              <li>
                <Link
                  href="/blog"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footer.blog")}
                </Link>
              </li>
              <li>
                <a
                  href="https://status.gatectr.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footer.status")}
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold mb-3">
              {t("footer.company")}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footer.about")}
                </Link>
              </li>
              <li>
                <Link
                  href="/careers"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footer.careers")}
                </Link>
              </li>
              <li>
                <a
                  href="mailto:hello@gatectr.com"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footer.contact")}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold mb-3">{t("footer.legal")}</h4>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footer.privacy")}
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("footer.terms")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">
            {t("footer.copyright", { year })}
          </span>
          <div className="flex items-center gap-6">
            <StatusDot label={t("footer.statusOperational")} />
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link
                href="/privacy"
                className="hover:text-foreground transition-colors"
              >
                {t("footer.privacy")}
              </Link>
              <Link
                href="/terms"
                className="hover:text-foreground transition-colors"
              >
                {t("footer.terms")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
