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
    auth: (await import(`../messages/${locale}/auth.json`)).default,
    onboarding: (await import(`../messages/${locale}/onboarding.json`)).default,
    home: (await import(`../messages/${locale}/home.json`)).default,
    features: (await import(`../messages/${locale}/features.json`)).default,
    pricing: (await import(`../messages/${locale}/pricing.json`)).default,
    metadata: (await import(`../messages/${locale}/metadata.json`)).default,
    dashboard: (await import(`../messages/${locale}/dashboard.json`)).default,
    billing: (await import(`../messages/${locale}/billing.json`)).default,
    // Admin — split per page
    adminShared: (await import(`../messages/${locale}/admin-shared.json`))
      .default,
    adminBilling: (await import(`../messages/${locale}/admin-billing.json`))
      .default,
    adminUsers: (await import(`../messages/${locale}/admin-users.json`))
      .default,
    adminAuditLogs: (
      await import(`../messages/${locale}/admin-audit-logs.json`)
    ).default,
    adminOverview: (await import(`../messages/${locale}/admin-overview.json`))
      .default,
    adminWaitlist: (await import(`../messages/${locale}/admin-waitlist.json`))
      .default,
    settings: (await import(`../messages/${locale}/settings.json`)).default,
    settingsProfile: (
      await import(`../messages/${locale}/settings-profile.json`)
    ).default,
    settingsSecurity: (
      await import(`../messages/${locale}/settings-security.json`)
    ).default,
    settingsProviders: (
      await import(`../messages/${locale}/settings-providers.json`)
    ).default,
    settingsApiKeys: (
      await import(`../messages/${locale}/settings-api-keys.json`)
    ).default,
    settingsBudget: (await import(`../messages/${locale}/settings-budget.json`))
      .default,
    settingsWorkspace: (
      await import(`../messages/${locale}/settings-workspace.json`)
    ).default,
    settingsTeam: (await import(`../messages/${locale}/settings-team.json`))
      .default,
    settingsNotifications: (
      await import(`../messages/${locale}/settings-notifications.json`)
    ).default,
    changelog: (await import(`../messages/${locale}/changelog.json`)).default,
    blocked: (await import(`../messages/${locale}/blocked.json`)).default,
    analytics: (await import(`../messages/${locale}/analytics.json`)).default,
    webhooks: (await import(`../messages/${locale}/webhooks.json`)).default,
    projects: (await import(`../messages/${locale}/projects.json`)).default,
    dashboardHome: (await import(`../messages/${locale}/dashboard-home.json`))
      .default,
    notifications: (await import(`../messages/${locale}/notifications.json`))
      .default,
    status: (await import(`../messages/${locale}/status.json`)).default,
  };

  return {
    locale,
    messages,
  };
});
