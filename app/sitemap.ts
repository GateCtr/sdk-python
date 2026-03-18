import type { MetadataRoute } from "next";
import {
  getSeoContext,
  buildCanonicalUrl,
  buildAlternateUrls,
} from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const context = await getSeoContext();

  // App subdomain: return empty array (Next.js serves 404 for empty sitemaps)
  if (context.isAppSubdomain) {
    return [];
  }

  const now = new Date();

  const pages = [
    { path: "/", changeFrequency: "weekly" as const, priority: 1.0 },
    { path: "/waitlist", changeFrequency: "monthly" as const, priority: 0.8 },
  ];

  return pages.map(({ path, changeFrequency, priority }) => {
    const alternates = buildAlternateUrls(path, context);
    return {
      url: buildCanonicalUrl(path, "en", context),
      lastModified: now,
      changeFrequency,
      priority,
      alternates: {
        languages: {
          en: alternates.en,
          fr: alternates.fr,
        },
      },
    };
  });
}
