import {
  clerkMiddleware,
  createRouteMatcher,
  clerkClient,
} from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { geolocation } from "@vercel/functions";
import { routing } from "./i18n/routing";
import { logAudit } from "@/lib/audit";
import { ALLOWED_COUNTRIES } from "./config/geo-allowed-countries";
import type { RoleName } from "@/types/globals";

// Create the i18n middleware
const intlMiddleware = createIntlMiddleware(routing);

// Define public routes that don't require authentication
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
  "/api/waitlist(.*)",
  "/api/v1/(.*)", // Public SDK API (auth via API key)
  "/api/health",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/fr/sign-in(.*)",
  "/fr/sign-up(.*)",
]);

// Admin routes requiring RBAC check
const isAdminRoute = createRouteMatcher(["/admin(.*)", "/fr/admin(.*)"]);

// Onboarding route — authenticated users who haven't completed onboarding land here
const isOnboardingRoute = createRouteMatcher(["/onboarding", "/fr/onboarding"]);

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

export default clerkMiddleware(async (auth, req) => {
  const { userId, sessionClaims } = await auth();
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") ?? "";
  // In dev (localhost / ngrok), subdomain routing is disabled — treat everything as app
  const isDev = process.env.NODE_ENV !== "production";
  const isAppSubdomain = isDev || host.startsWith("app.");

  // ── Geo-blocking ──────────────────────────────────────────────────────────
  const geoEnabled = process.env.ENABLE_GEO_BLOCKING === "true";
  const isBlockedPage = pathname === "/blocked" || pathname === "/fr/blocked";

  if (geoEnabled && !isBlockedPage && !pathname.startsWith("/api")) {
    const { country } = geolocation(req);
    if (country && !ALLOWED_COUNTRIES.includes(country)) {
      const blockedPath = pathname.startsWith("/fr")
        ? "/fr/blocked"
        : "/blocked";
      return NextResponse.redirect(new URL(blockedPath, req.url));
    }
  }

  // ── Subdomain routing ─────────────────────────────────────────────────────
  // app.gatectr.com → redirect / to /dashboard
  if (isAppSubdomain && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  // gatectr.com (marketing) → block access to app routes
  if (
    !isAppSubdomain &&
    (pathname.startsWith("/dashboard") ||
      pathname.startsWith("/onboarding") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/fr/dashboard") ||
      pathname.startsWith("/fr/onboarding") ||
      pathname.startsWith("/fr/admin"))
  ) {
    return NextResponse.redirect(new URL("/", req.url));
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
    return NextResponse.redirect(new URL(waitlistPath, req.url));
  }

  // ── Unauthenticated protection (Req 2.1, 17.1–17.4) ──────────────────────
  if (!isPublicRoute(req) && !userId) {
    const signInPath = locale === "fr" ? "/fr/sign-in" : "/sign-in";
    const signInUrl = new URL(signInPath, req.url);
    const safeRedirect = sanitizeRedirectUrl(pathname, req.url);
    if (safeRedirect) {
      signInUrl.searchParams.set("redirect_url", safeRedirect);
    }
    return NextResponse.redirect(signInUrl);
  }

  // ── Onboarding gate ───────────────────────────────────────────────────────
  if (userId && !isPublicRoute(req)) {
    // JWT publicMetadata can be stale (cached up to 60s).
    // For the onboarding gate we fetch fresh data from Clerk API.
    let onboardingDone =
      sessionClaims?.publicMetadata?.onboardingComplete === true;

    if (!onboardingDone) {
      try {
        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        onboardingDone =
          (user.publicMetadata as { onboardingComplete?: boolean })
            ?.onboardingComplete === true;
      } catch {
        // Fail open — let the JWT value decide if Clerk API is unreachable
      }
    }

    // Already done but trying to access onboarding → redirect to dashboard
    if (onboardingDone && isOnboardingRoute(req)) {
      const dashboardPath = locale === "fr" ? "/fr/dashboard" : "/dashboard";
      return NextResponse.redirect(new URL(dashboardPath, req.url));
    }

    // Not done yet and not on onboarding → redirect to onboarding
    if (!onboardingDone && !isOnboardingRoute(req)) {
      const onboardingPath = locale === "fr" ? "/fr/onboarding" : "/onboarding";
      return NextResponse.redirect(new URL(onboardingPath, req.url));
    }
  }

  // ── Admin RBAC check (Req 6.1–6.3, 8.7, 9.3) ─────────────────────────────
  if (isAdminRoute(req) && userId) {
    try {
      // Read role from session token — no DB query needed
      const role = sessionClaims?.publicMetadata?.role as RoleName | undefined;
      const ADMIN_ROLES: RoleName[] = [
        "SUPER_ADMIN",
        "ADMIN",
        "MANAGER",
        "SUPPORT",
      ];
      const hasAccess = role ? ADMIN_ROLES.includes(role) : false;

      if (!hasAccess) {
        await logAudit({
          userId,
          resource: pathname,
          action: "access.denied",
          success: false,
          ipAddress:
            req.headers.get("x-forwarded-for") ??
            req.headers.get("x-real-ip") ??
            undefined,
          userAgent: req.headers.get("user-agent") ?? undefined,
        });

        const dashboardPath = locale === "fr" ? "/fr/dashboard" : "/dashboard";
        const dashboardUrl = new URL(dashboardPath, req.url);
        dashboardUrl.searchParams.set("error", "access_denied");
        return NextResponse.redirect(dashboardUrl);
      }
    } catch (err) {
      // Fail-secure: deny access on errors (Req 18.7)
      console.error("[middleware] RBAC check error:", err);
      const dashboardPath = locale === "fr" ? "/fr/dashboard" : "/dashboard";
      return NextResponse.redirect(new URL(dashboardPath, req.url));
    }
  }

  // ── i18n middleware ───────────────────────────────────────────────────────
  return intlMiddleware(req);
});

export const config = {
  matcher: [
    "/((?!_next|_vercel|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc|__clerk)(.*)",
  ],
};
