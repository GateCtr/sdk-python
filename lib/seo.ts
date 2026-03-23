/**
 * lib/seo.ts — Shared SEO context utility
 *
 * Provides subdomain-aware URL construction for canonical URLs and hreflang
 * alternates. Detects marketing vs app subdomain from the request host header.
 */

export interface SeoContext {
  marketingUrl: string;
  appUrl: string;
  isAppSubdomain: boolean;
}

const DEFAULT_MARKETING_URL = "https://gatectr.com";
const DEFAULT_APP_URL = "https://app.gatectr.com";

function resolveUrls(): { marketingUrl: string; appUrl: string } {
  return {
    marketingUrl:
      process.env.NEXT_PUBLIC_MARKETING_URL ?? DEFAULT_MARKETING_URL,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL,
  };
}

/**
 * Reads the `host` header via next/headers and returns the SEO context.
 * Call only in Server Components, generateMetadata, Route Handlers, or
 * sitemap/robots handlers.
 */
export async function getSeoContext(): Promise<SeoContext> {
  const { headers } = await import("next/headers");
  const headerStore = await headers();
  // x-forwarded-host is more reliable on Vercel/proxied environments
  const host =
    headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  return getSeoContextWithHost(host);
}

/**
 * Testable overload — accepts a host string directly, bypassing next/headers.
 */
export function getSeoContextWithHost(host: string): SeoContext {
  const { marketingUrl, appUrl } = resolveUrls();
  // Strip port for comparison (e.g. localhost:3000)
  const hostWithoutPort = host.split(":")[0];
  const isAppSubdomain =
    host.startsWith("app.") || hostWithoutPort === new URL(appUrl).hostname;
  return { marketingUrl, appUrl, isAppSubdomain };
}

/** Joins a base URL and a path, ensuring exactly one slash between them. */
function joinUrl(base: string, path: string): string {
  const trimmedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalisedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${normalisedPath}`;
}

/**
 * Builds the canonical URL for a given path and locale.
 *
 * Rules:
 * - Marketing EN: `{marketingUrl}{path}` (no locale prefix)
 * - Marketing FR: `{marketingUrl}/fr{path}`
 * - App EN: `{appUrl}{path}`
 * - App FR: `{appUrl}/fr{path}`
 *
 * Never produces double slashes.
 */
export function buildCanonicalUrl(
  path: string,
  locale: string,
  context: SeoContext,
): string {
  const base = context.isAppSubdomain ? context.appUrl : context.marketingUrl;

  // Normalise: ensure path starts with / and has no consecutive slashes
  const normPath = ("/" + path.replace(/^\/+/, "")).replace(/\/+/g, "/");

  if (locale === "fr") {
    // Avoid double slash when path is exactly "/"
    const frPath = normPath === "/" ? "/fr/" : `/fr${normPath}`;
    return joinUrl(base, frPath);
  }

  return joinUrl(base, normPath);
}

/**
 * Returns the og:locale and og:locale:alternate values for a given locale.
 * The two values are always complementary — they are never equal.
 */
export function buildOgLocale(locale: string): {
  locale: string;
  alternateLocale: string;
} {
  const ogLocale = locale === "fr" ? "fr_FR" : "en_US";
  const ogAlternateLocale = locale === "fr" ? "en_US" : "fr_FR";
  return { locale: ogLocale, alternateLocale: ogAlternateLocale };
}

/**
 * Returns hreflang alternate URLs for a given path.
 * xDefault points to the English URL.
 */
export function buildAlternateUrls(
  path: string,
  context: SeoContext,
): { en: string; fr: string; xDefault: string } {
  const en = buildCanonicalUrl(path, "en", context);
  const fr = buildCanonicalUrl(path, "fr", context);
  return { en, fr, xDefault: en };
}
