/**
 * Product constants — single source of truth for metrics, pricing, and SDK references.
 * Update here when numbers or package names change.
 */

export const PRODUCT = {
  sdk: {
    npm: "@gatectr/sdk",
    pip: "gatectr",
  },
  api: {
    baseUrl: "https://api.gatectr.com/v1",
  },
  metrics: {
    tokenReduction: "-40%",
    setupTime: "5 min",
    latency: "< 10ms",
    providers: 4,
    sla: "99.9%",
    auditRetentionDays: 90,
  },
  plans: {
    free: {
      price: { en: "€0", fr: "0 €" },
      tokenLimit: "50K",
      projects: 1,
      webhooks: 1,
    },
    pro: {
      price: { en: "€29", fr: "29 €" },
      tokenLimit: "2M",
      projects: 5,
    },
    team: {
      price: { en: "€99", fr: "99 €" },
      tokenLimit: "10M",
    },
    enterprise: {
      price: { en: "Custom", fr: "Sur devis" },
    },
  },
} as const;
