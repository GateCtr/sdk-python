import type { MetadataRoute } from "next";
import { getSeoContext, type SeoContext } from "@/lib/seo";

export function generateRobots(context: SeoContext): MetadataRoute.Robots {
  // App subdomain: disallow all, no sitemap
  if (context.isAppSubdomain) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  // Marketing subdomain: allow public pages, disallow private routes
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/fr/dashboard",
          "/admin",
          "/fr/admin",
          "/api",
          "/onboarding",
          "/fr/onboarding",
          "/sign-in",
          "/fr/sign-in",
          "/sign-up",
          "/fr/sign-up",
        ],
      },
    ],
    sitemap: `${context.marketingUrl}/sitemap.xml`,
  };
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const context = await getSeoContext();
  return generateRobots(context);
}
