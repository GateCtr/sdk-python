import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as "en" | "fr")) {
    locale = routing.defaultLocale;
  }

  // Load all message files for the locale
  const messages = {
    common: (await import(`../messages/${locale}/common.json`)).default,
    waitlist: (await import(`../messages/${locale}/waitlist.json`)).default,
    admin: (await import(`../messages/${locale}/admin.json`)).default,
    auth: (await import(`../messages/${locale}/auth.json`)).default,
    onboarding: (await import(`../messages/${locale}/onboarding.json`)).default,
    home: (await import(`../messages/${locale}/home.json`)).default,
    features: (await import(`../messages/${locale}/features.json`)).default,
    pricing: (await import(`../messages/${locale}/pricing.json`)).default,
    metadata: (await import(`../messages/${locale}/metadata.json`)).default,
    dashboard: (await import(`../messages/${locale}/dashboard.json`)).default,
  };

  return {
    locale,
    messages,
  };
});
