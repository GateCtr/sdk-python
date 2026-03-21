import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { geolocation } from "@vercel/functions";
import { routing } from "./i18n/routing";
import { logAudit } from "@/lib/audit";
import { ALLOWED_COUNTRIES } from "./config/geo-allowed-countries";
import { applySecurityHeaders } from "@/lib/security-headers";
import type { RoleName } from "@/types/globals";

// Create the i18n middleware
const intlMiddleware = createIntlMiddleware(routing);

// Define public routes that don't require authentication
// Use (/:locale)? pattern to match both /path and /fr/path without hardcoding locales
const isPublicRoute = createRouteMatcher([
  "/",
  "/fr",
  "/features",
  "/fr/features",
  "/pricing",
  "/fr/pricing",
  "/waitlist",
  "/fr/waitlist",
  "/docs(.*)",
  "/fr/docs(.*)",
  "/changelog(.*)",
  "/fr/changelog(.*)",
  "/sign-in(.*)",
  "/fr/sign-in(.*)",
  "/sign-up(.*)",
  "/fr/sign-up(.*)",
  "/api/waitlist(.*)",
  "/api/v1/(.*)",
  "/api/health",
  "/sitemap.xml",
  "/robots.txt",
]);

// Admin routes requiring RBAC check
const isAdminRoute = createRouteMatcher(["/((?:fr)/)?admin(.*)"]);

// Onboarding route — authenticated users who haven't completed onboarding land here
const isOnboardingRoute = createRouteMatcher(["/((?:fr)/)?onboarding"]);

/** Allowed redirect hosts — prevents open-redirect attacks (Req 8.6, 17.5) */
const ALLOWED_REDIRECT_HOSTS = new Set([
  process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
    : "localhost:3000",
]);

/**
 * Sanitize a redirect_url parameter.
 * Returns the path if it is safe, or null if it should be ignored.
 */
function sanitizeRedirectUrl(
  raw: string | null,
  requestUrl: string,
): string | null {
  if (!raw) return null;
  try {
    const base = new URL(requestUrl);
    const target = new URL(raw, base);
    // Reject external domains
    if (!ALLOWED_REDIRECT_HOSTS.has(target.host)) return null;
    // Return only the path + search + hash (never the full URL)
    return target.pathname + target.search + target.hash;
  } catch {
    return null;
  }
}

export default clerkMiddleware(
  async (auth, req) => {
    const { userId, sessionClaims } = await auth();
    const { pathname } = req.nextUrl;
    const host = req.headers.get("host") ?? "";
    // In dev (localhost / ngrok), subdomain routing is disabled — treat everything as app
    const isDev = process.env.NODE_ENV !== "production";
    const isAppSubdomain = isDev || host.startsWith("app.");

    /** Wrap any NextResponse with security headers before returning */
    const secure = (res: NextResponse) => applySecurityHeaders(res);

    // ── Geo-blocking ──────────────────────────────────────────────────────────
    const geoEnabled = process.env.ENABLE_GEO_BLOCKING === "true";
    const isBlockedPage = pathname === "/blocked" || pathname === "/fr/blocked";

    if (geoEnabled && !isBlockedPage && !pathname.startsWith("/api")) {
      const { country } = geolocation(req);
      if (country && !ALLOWED_COUNTRIES.includes(country)) {
        const blockedPath = pathname.startsWith("/fr")
          ? "/fr/blocked"
          : "/blocked";
        return secure(NextResponse.redirect(new URL(blockedPath, req.url)));
      }
    }

    // ── Subdomain routing ─────────────────────────────────────────────────────
    // gatectr.com (marketing) → redirect app routes to app.gatectr.com
    if (!isAppSubdomain) {
      const appRoutes = [
        "/dashboard",
        "/fr/dashboard",
        "/onboarding",
        "/fr/onboarding",
        "/admin",
        "/fr/admin",
        "/sign-in",
        "/fr/sign-in",
        "/sign-up",
        "/fr/sign-up",
      ];
      if (appRoutes.some((r) => pathname.startsWith(r))) {
        const appBase =
          process.env.NEXT_PUBLIC_APP_URL ?? "https://app.gatectr.com";
        return secure(NextResponse.redirect(new URL(pathname, appBase)));
      }
    }

    // app.gatectr.com (app) → redirect marketing-only routes to gatectr.com
    if (isAppSubdomain && !isDev) {
      const marketingRoutes = [
        "/waitlist",
        "/fr/waitlist",
        "/features",
        "/fr/features",
        "/pricing",
        "/fr/pricing",
        "/changelog",
        "/fr/changelog",
      ];
      if (
        marketingRoutes.some(
          (r) => pathname === r || pathname.startsWith(r + "/"),
        )
      ) {
        const marketingBase =
          process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://gatectr.com";
        return secure(NextResponse.redirect(new URL(pathname, marketingBase)));
      }
    }

    // ── API routes ────────────────────────────────────────────────────────────
    if (pathname.startsWith("/api")) {
      // Webhook routes are public (verified by Svix internally)
      if (pathname.startsWith("/api/webhooks/")) {
        return NextResponse.next();
      }
      if (!isPublicRoute(req) && !userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.next();
    }

    // ── Locale extraction ─────────────────────────────────────────────────────
    const localeMatch = pathname.match(/^\/fr(\/|$)/);
    const locale = localeMatch ? "fr" : routing.defaultLocale;

    // ── Waitlist redirect ─────────────────────────────────────────────────────
    const waitlistEnabled = process.env.ENABLE_WAITLIST === "true";
    const signupsDisabled = process.env.ENABLE_SIGNUPS === "false";
    if (waitlistEnabled && signupsDisabled && pathname.includes("/sign-up")) {
      const waitlistPath = locale === "fr" ? "/fr/waitlist" : "/waitlist";
      return secure(NextResponse.redirect(new URL(waitlistPath, req.url)));
    }

    // ── Auth pages — redirect authenticated users to dashboard ──────────────
    if (
      userId &&
      (pathname.includes("/sign-in") || pathname.includes("/sign-up"))
    ) {
      const dashboardPath = locale === "fr" ? "/fr/dashboard" : "/dashboard";
      return secure(NextResponse.redirect(new URL(dashboardPath, req.url)));
    }

    // ── Unauthenticated protection (Req 2.1, 17.1–17.4) ──────────────────────
    if (!isPublicRoute(req) && !userId) {
      const signInPath = locale === "fr" ? "/fr/sign-in" : "/sign-in";
      // Guard: never redirect to sign-in if already on an auth route
      if (pathname.includes("/sign-in") || pathname.includes("/sign-up")) {
        return secure(intlMiddleware(req));
      }
      const signInUrl = new URL(signInPath, req.url);
      if (!isOnboardingRoute(req)) {
        const safeRedirect = sanitizeRedirectUrl(pathname, req.url);
        if (safeRedirect) {
          signInUrl.searchParams.set("redirect_url", safeRedirect);
        }
      }
      return secure(NextResponse.redirect(signInUrl));
    }

    // ── Onboarding gate ───────────────────────────────────────────────────────
    if (userId && !isPublicRoute(req)) {
      const meta = (sessionClaims?.metadata ??
        sessionClaims?.publicMetadata) as Record<string, unknown> | undefined;
      const onboardingMeta = meta?.onboardingComplete;
      const onboardingDone = onboardingMeta === true;
      const onboardingExplicitlyFalse = onboardingMeta === false;

      if (onboardingDone && isOnboardingRoute(req)) {
        const dashboardPath = locale === "fr" ? "/fr/dashboard" : "/dashboard";
        return secure(NextResponse.redirect(new URL(dashboardPath, req.url)));
      }

      if (onboardingExplicitlyFalse && !isOnboardingRoute(req)) {
        const onboardingPath =
          locale === "fr" ? "/fr/onboarding" : "/onboarding";
        return secure(NextResponse.redirect(new URL(onboardingPath, req.url)));
      }
    }

    // ── Admin RBAC check (Req 6.1–6.3, 8.7, 9.3) ─────────────────────────────
    if (isAdminRoute(req) && userId) {
      const meta = (sessionClaims?.metadata ??
        sessionClaims?.publicMetadata) as Record<string, unknown> | undefined;
      const role = meta?.role as RoleName | undefined;
      const ADMIN_ROLES: RoleName[] = [
        "SUPER_ADMIN",
        "ADMIN",
        "MANAGER",
        "SUPPORT",
      ];
      const hasAccess = role ? ADMIN_ROLES.includes(role) : false;

      if (!hasAccess) {
        logAudit({
          resource: pathname,
          action: "access.denied",
          success: false,
          ipAddress:
            req.headers.get("x-forwarded-for") ??
            req.headers.get("x-real-ip") ??
            undefined,
          userAgent: req.headers.get("user-agent") ?? undefined,
        }).catch((err) => console.error("[middleware] audit log failed:", err));

        const dashboardPath = locale === "fr" ? "/fr/dashboard" : "/dashboard";
        const dashboardUrl = new URL(dashboardPath, req.url);
        dashboardUrl.searchParams.set("error", "access_denied");
        return secure(NextResponse.redirect(dashboardUrl));
      }
    }

    // ── i18n middleware ───────────────────────────────────────────────────────
    return secure(intlMiddleware(req));
  },
  // Tolerate up to 30s of clock skew (Windows system clock drift in dev)
  { clockSkewInMs: 30_000 },
);

export const config = {
  matcher: [
    "/((?!_next|_vercel|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)",
    "/(api|trpc|__clerk)(.*)",
  ],
};
