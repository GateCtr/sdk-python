import { NextResponse } from "next/server";

/**
 * Apply security headers to a NextResponse.
 * Call this on all responses from the middleware.
 *
 * References:
 * - OWASP Secure Headers Project
 * - https://securityheaders.com
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  const h = response.headers;

  // Prevent clickjacking
  h.set("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  h.set("X-Content-Type-Options", "nosniff");

  // Referrer policy — don't leak full URL to third parties
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy — disable unused browser features
  h.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(self), usb=()",
  );

  // HSTS — force HTTPS for 1 year (only in production)
  if (process.env.NODE_ENV === "production") {
    h.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  // Content Security Policy
  const isDev = process.env.NODE_ENV !== "production";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const csp = [
    "default-src 'self'",
    // Scripts: self + Next.js inline scripts + Clerk + Stripe
    isDev
      ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.clerk.accounts.dev https://js.stripe.com"
      : "script-src 'self' 'unsafe-inline' blob: https://*.clerk.accounts.dev https://clerk.app.gatectr.com https://js.stripe.com https://cdn.jsdelivr.net",
    // Styles: self + inline (Tailwind/shadcn injects inline styles)
    "style-src 'self' 'unsafe-inline'",
    // Images: self + data URIs + Clerk avatars + external CDNs
    "img-src 'self' data: blob: https://img.clerk.com https://images.clerk.dev https://www.gravatar.com",
    // Fonts: self
    "font-src 'self' data:",
    // Connect: self + Clerk + Stripe + Sentry + Upstash
    `connect-src 'self' ${appUrl} https://*.clerk.accounts.dev https://clerk.app.gatectr.com https://api.clerk.dev https://js.stripe.com https://api.stripe.com https://*.sentry.io https://o*.ingest.sentry.io wss://*.clerk.accounts.dev wss://clerk.app.gatectr.com`,
    // Frames: Stripe only (for payment elements)
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    // Workers: self + blob (Next.js RSC + Clerk workers)
    "worker-src 'self' blob:",
    // Form actions: self only
    "form-action 'self'",
    // Base URI: self only (prevent base tag injection)
    "base-uri 'self'",
    // Object: none (no Flash/plugins)
    "object-src 'none'",
  ].join("; ");

  h.set("Content-Security-Policy", csp);

  return response;
}
