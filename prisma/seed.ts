import { prisma } from "../lib/prisma";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

async function upsertPlanWithLimits(
  planData: {
    name: "FREE" | "PRO" | "TEAM" | "ENTERPRISE";
    displayName: string;
    description?: string;
    stripePriceIdMonthly?: string | null;
    stripePriceIdYearly?: string | null;
    isActive?: boolean;
    isPublic?: boolean;
    sortOrder?: number;
  },
  limitsData: AnyRecord,
) {
  const plan = await prisma.plan.upsert({
    where: { name: planData.name as "FREE" | "PRO" | "TEAM" | "ENTERPRISE" },
    update: {
      displayName: planData.displayName,
      description: planData.description,
      stripePriceIdMonthly: planData.stripePriceIdMonthly ?? null,
      stripePriceIdYearly: planData.stripePriceIdYearly ?? null,
      isActive: planData.isActive,
      isPublic: planData.isPublic,
      sortOrder: planData.sortOrder,
    },
    create: planData,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma.planLimit as any).upsert({
    where: { planId: plan.id },
    update: limitsData,
    create: {
      ...limitsData,
      plan: { connect: { id: plan.id } },
    },
  });

  return plan;
}

async function main() {
  console.log("🌱 Seeding database...");

  // ── Plans ──────────────────────────────────────────────────────────────────

  const freePlan = await upsertPlanWithLimits(
    {
      name: "FREE",
      displayName: "Free",
      description: "Perfect for testing and small projects",
      isActive: true,
      isPublic: true,
      sortOrder: 1,
    },
    {
      maxTokensPerMonth: 50_000,
      maxRequestsPerDay: 1_000,
      maxRequestsPerMinute: 10,
      maxProjects: 1,
      maxApiKeys: 1,
      maxWebhooks: 1,
      maxTeamMembers: 1,
      contextOptimizerEnabled: false,
      modelRouterEnabled: false,
      advancedAnalytics: false,
      auditLogsRetentionDays: 7,
      supportLevel: "community",
    },
  );

  const proPlan = await upsertPlanWithLimits(
    {
      name: "PRO",
      displayName: "Pro",
      description: "For professionals and growing teams",
      stripePriceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? null,
      stripePriceIdYearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? null,
      isActive: true,
      isPublic: true,
      sortOrder: 2,
    },
    {
      maxTokensPerMonth: 2_000_000,
      maxRequestsPerDay: 60_000,
      maxRequestsPerMinute: 60,
      maxProjects: 5,
      maxApiKeys: 5,
      maxWebhooks: null,
      maxTeamMembers: 1,
      contextOptimizerEnabled: true,
      modelRouterEnabled: true,
      advancedAnalytics: true,
      auditLogsRetentionDays: 30,
      supportLevel: "email",
    },
  );

  const teamPlan = await upsertPlanWithLimits(
    {
      name: "TEAM",
      displayName: "Team",
      description: "For teams that need collaboration and governance",
      stripePriceIdMonthly: process.env.STRIPE_PRICE_TEAM_MONTHLY ?? null,
      stripePriceIdYearly: process.env.STRIPE_PRICE_TEAM_YEARLY ?? null,
      isActive: true,
      isPublic: true,
      sortOrder: 3,
    },
    {
      maxTokensPerMonth: 10_000_000,
      maxRequestsPerDay: 200_000,
      maxRequestsPerMinute: 200,
      maxProjects: null,
      maxApiKeys: null,
      maxWebhooks: null,
      maxTeamMembers: 3, // 3 inclus — supplémentaires facturés $15/seat/mois
      contextOptimizerEnabled: true,
      modelRouterEnabled: true,
      advancedAnalytics: true,
      auditLogsRetentionDays: 90,
      supportLevel: "priority",
    },
  );

  const enterprisePlan = await upsertPlanWithLimits(
    {
      name: "ENTERPRISE",
      displayName: "Enterprise",
      description: "Unlimited scale with dedicated support and SLA",
      stripePriceIdMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? null,
      stripePriceIdYearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY ?? null,
      isActive: true,
      isPublic: true,
      sortOrder: 4,
    },
    {
      maxTokensPerMonth: null,
      maxRequestsPerDay: null,
      maxRequestsPerMinute: 1_000,
      maxProjects: null,
      maxApiKeys: null,
      maxWebhooks: null,
      maxTeamMembers: null,
      contextOptimizerEnabled: true,
      modelRouterEnabled: true,
      advancedAnalytics: true,
      auditLogsRetentionDays: 365,
      supportLevel: "dedicated",
    },
  );

  console.log("✅ Plans created:", {
    freePlan: freePlan.name,
    proPlan: proPlan.name,
    teamPlan: teamPlan.name,
    enterprisePlan: enterprisePlan.name,
  });

  // ── Roles ──────────────────────────────────────────────────────────────────

  const roleDefinitions: Array<{
    name:
      | "SUPER_ADMIN"
      | "ADMIN"
      | "MANAGER"
      | "DEVELOPER"
      | "VIEWER"
      | "SUPPORT";
    displayName: string;
    description: string;
  }> = [
    {
      name: "SUPER_ADMIN",
      displayName: "Super Admin",
      description: "Full system access",
    },
    { name: "ADMIN", displayName: "Admin", description: "Organization admin" },
    { name: "MANAGER", displayName: "Manager", description: "Team manager" },
    {
      name: "DEVELOPER",
      displayName: "Developer",
      description: "Developer access",
    },
    { name: "VIEWER", displayName: "Viewer", description: "Read-only access" },
    {
      name: "SUPPORT",
      displayName: "Support",
      description: "Support team access",
    },
  ];

  for (const role of roleDefinitions) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }

  console.log("✅ Roles created");

  // ── Permissions ────────────────────────────────────────────────────────────

  const permissionDefs = [
    { resource: "user", action: "read" },
    { resource: "user", action: "create" },
    { resource: "user", action: "update" },
    { resource: "user", action: "delete" },
    { resource: "project", action: "read" },
    { resource: "project", action: "create" },
    { resource: "project", action: "update" },
    { resource: "project", action: "delete" },
    { resource: "api_key", action: "read" },
    { resource: "api_key", action: "create" },
    { resource: "api_key", action: "update" },
    { resource: "api_key", action: "delete" },
    { resource: "budget", action: "read" },
    { resource: "budget", action: "create" },
    { resource: "budget", action: "update" },
    { resource: "budget", action: "delete" },
    { resource: "analytics", action: "read" },
    { resource: "analytics", action: "export" },
    { resource: "webhook", action: "read" },
    { resource: "webhook", action: "create" },
    { resource: "webhook", action: "update" },
    { resource: "webhook", action: "delete" },
    { resource: "team", action: "read" },
    { resource: "team", action: "create" },
    { resource: "team", action: "update" },
    { resource: "team", action: "delete" },
    { resource: "team", action: "invite" },
    { resource: "team", action: "remove_member" },
    { resource: "billing", action: "read" },
    { resource: "billing", action: "update" },
    { resource: "plan", action: "read" },
    { resource: "plan", action: "create" },
    { resource: "plan", action: "update" },
    { resource: "plan", action: "delete" },
    { resource: "feature_flag", action: "read" },
    { resource: "feature_flag", action: "create" },
    { resource: "feature_flag", action: "update" },
    { resource: "feature_flag", action: "delete" },
    { resource: "audit_log", action: "read" },
    { resource: "system", action: "read" },
    { resource: "system", action: "manage" },
  ];

  const createdPermissions: Record<string, { id: string }> = {};
  for (const p of permissionDefs) {
    const created = await prisma.permission.upsert({
      where: { resource_action: { resource: p.resource, action: p.action } },
      update: {},
      create: p,
    });
    createdPermissions[`${p.resource}:${p.action}`] = created;
  }

  console.log("✅ Permissions created");

  // ── Role → Permission assignments ──────────────────────────────────────────

  const roles = await prisma.role.findMany();
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r]));

  const p = (key: string) => createdPermissions[key].id;

  const assignments: Array<{ roleName: string; permKeys: string[] }> = [
    {
      roleName: "SUPER_ADMIN",
      permKeys: Object.keys(createdPermissions),
    },
    {
      roleName: "ADMIN",
      permKeys: [
        "user:read",
        "user:create",
        "user:update",
        "project:read",
        "project:create",
        "project:update",
        "project:delete",
        "api_key:read",
        "api_key:create",
        "api_key:update",
        "api_key:delete",
        "budget:read",
        "budget:create",
        "budget:update",
        "budget:delete",
        "analytics:read",
        "analytics:export",
        "webhook:read",
        "webhook:create",
        "webhook:update",
        "webhook:delete",
        "team:read",
        "team:create",
        "team:update",
        "team:delete",
        "team:invite",
        "team:remove_member",
        "billing:read",
        "billing:update",
        "audit_log:read",
      ],
    },
    {
      roleName: "MANAGER",
      permKeys: [
        "user:read",
        "project:read",
        "project:create",
        "project:update",
        "api_key:read",
        "api_key:create",
        "budget:read",
        "budget:update",
        "analytics:read",
        "webhook:read",
        "webhook:create",
        "webhook:update",
        "team:read",
        "team:invite",
        "billing:read",
      ],
    },
    {
      roleName: "DEVELOPER",
      permKeys: [
        "project:read",
        "project:create",
        "project:update",
        "api_key:read",
        "api_key:create",
        "budget:read",
        "analytics:read",
        "webhook:read",
        "webhook:create",
        "team:read",
      ],
    },
    {
      roleName: "VIEWER",
      permKeys: [
        "project:read",
        "api_key:read",
        "budget:read",
        "analytics:read",
        "webhook:read",
        "team:read",
      ],
    },
    {
      roleName: "SUPPORT",
      permKeys: [
        "user:read",
        "project:read",
        "analytics:read",
        "audit_log:read",
        "system:read",
      ],
    },
  ];

  for (const { roleName, permKeys } of assignments) {
    const role = roleMap[roleName];
    if (!role) continue;
    for (const key of permKeys) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: p(key) },
        },
        update: {},
        create: { roleId: role.id, permissionId: p(key) },
      });
    }
  }

  console.log("✅ Role permissions assigned");

  // ── LLM Provider Configs ───────────────────────────────────────────────────

  const providers = [
    {
      provider: "openai",
      displayName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
    },
    {
      provider: "anthropic",
      displayName: "Anthropic",
      baseUrl: "https://api.anthropic.com/v1",
    },
    {
      provider: "mistral",
      displayName: "Mistral AI",
      baseUrl: "https://api.mistral.ai/v1",
    },
    {
      provider: "gemini",
      displayName: "Google Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    },
  ];

  for (const provider of providers) {
    await prisma.lLMProviderConfig.upsert({
      where: { provider: provider.provider },
      update: {
        defaultTimeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        isActive: true,
      },
      create: {
        ...provider,
        defaultTimeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
      },
    });
  }

  console.log("✅ LLM Provider configs created");

  // ── Model Catalog ──────────────────────────────────────────────────────────

  const providerConfigMap = await prisma.lLMProviderConfig.findMany({
    where: { provider: { in: ["openai", "anthropic", "mistral", "gemini"] } },
  });
  const providerIdMap = Object.fromEntries(
    providerConfigMap.map((p) => [p.provider, p.id]),
  );

  // Model catalog — updated March 2026
  // Sources: OpenAI pricing (pecollective.com), Anthropic (claudefa.st),
  //          Mistral (inworld.ai / docs.mistral.ai), Google (winbuzzer / deepmind.google)
  // Costs stored per 1K tokens (divide published per-1M prices by 1000)
  const models = [
    // ── OpenAI ────────────────────────────────────────────────────────────────
    // GPT-4.1 — recommended production model (replaced GPT-4o), 1M context
    {
      modelId: "gpt-4.1",
      provider: "openai",
      displayName: "GPT-4.1",
      contextWindow: 1_000_000,
      maxOutputTokens: 32_768,
      inputCostPer1kTokens: 0.002, // $2.00 / 1M
      outputCostPer1kTokens: 0.008, // $8.00 / 1M
      capabilities: ["chat", "complete", "vision", "function_calling"],
    },
    // GPT-4.1 Mini — mid-tier, 5× cheaper than GPT-4.1
    {
      modelId: "gpt-4.1-mini",
      provider: "openai",
      displayName: "GPT-4.1 Mini",
      contextWindow: 1_000_000,
      maxOutputTokens: 32_768,
      inputCostPer1kTokens: 0.0004, // $0.40 / 1M
      outputCostPer1kTokens: 0.0016, // $1.60 / 1M
      capabilities: ["chat", "complete", "function_calling"],
    },
    // GPT-4.1 Nano — cheapest capable OpenAI model, routing & classification
    {
      modelId: "gpt-4.1-nano",
      provider: "openai",
      displayName: "GPT-4.1 Nano",
      contextWindow: 1_000_000,
      maxOutputTokens: 16_384,
      inputCostPer1kTokens: 0.0001, // $0.10 / 1M
      outputCostPer1kTokens: 0.0004, // $0.40 / 1M
      capabilities: ["chat", "complete"],
    },
    // GPT-5 — flagship, agentic workflows
    {
      modelId: "gpt-5",
      provider: "openai",
      displayName: "GPT-5",
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      inputCostPer1kTokens: 0.00125, // $1.25 / 1M
      outputCostPer1kTokens: 0.01, // $10.00 / 1M
      capabilities: ["chat", "complete", "vision", "function_calling"],
    },
    // o4-mini — best-value reasoning model
    {
      modelId: "o4-mini",
      provider: "openai",
      displayName: "o4-mini",
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
      inputCostPer1kTokens: 0.0011, // $1.10 / 1M
      outputCostPer1kTokens: 0.0044, // $4.40 / 1M
      capabilities: ["chat", "complete", "function_calling"],
    },
    // o3 — advanced reasoning
    {
      modelId: "o3",
      provider: "openai",
      displayName: "o3",
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
      inputCostPer1kTokens: 0.002, // $2.00 / 1M
      outputCostPer1kTokens: 0.008, // $8.00 / 1M
      capabilities: ["chat", "complete", "function_calling"],
    },

    // ── Anthropic ─────────────────────────────────────────────────────────────
    // Claude Sonnet 4.6 — daily driver, opus-level coding at sonnet price
    {
      modelId: "claude-sonnet-4-6",
      provider: "anthropic",
      displayName: "Claude Sonnet 4.6",
      contextWindow: 1_000_000,
      maxOutputTokens: 8_192,
      inputCostPer1kTokens: 0.003, // $3.00 / 1M
      outputCostPer1kTokens: 0.015, // $15.00 / 1M
      capabilities: ["chat", "complete", "vision", "function_calling"],
    },
    // Claude Opus 4.6 — deep reasoning, 1M context GA, agent teams
    {
      modelId: "claude-opus-4-6",
      provider: "anthropic",
      displayName: "Claude Opus 4.6",
      contextWindow: 1_000_000,
      maxOutputTokens: 8_192,
      inputCostPer1kTokens: 0.005, // $5.00 / 1M
      outputCostPer1kTokens: 0.025, // $25.00 / 1M
      capabilities: ["chat", "complete", "vision", "function_calling"],
    },
    // Claude Haiku 4.5 — budget tier, fast & cheap
    {
      modelId: "claude-haiku-4-5",
      provider: "anthropic",
      displayName: "Claude Haiku 4.5",
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      inputCostPer1kTokens: 0.0008, // $0.80 / 1M (estimated budget tier)
      outputCostPer1kTokens: 0.004, // $4.00 / 1M
      capabilities: ["chat", "complete", "vision"],
    },

    // ── Mistral ───────────────────────────────────────────────────────────────
    // Mistral Large 3 — frontier open-weight, 256K context, vision
    {
      modelId: "mistral-large-2512",
      provider: "mistral",
      displayName: "Mistral Large 3",
      contextWindow: 256_000,
      maxOutputTokens: 8_192,
      inputCostPer1kTokens: 0.0005, // $0.50 / 1M
      outputCostPer1kTokens: 0.0015, // $1.50 / 1M
      capabilities: ["chat", "complete", "vision", "function_calling"],
    },
    // Mistral Medium 3 — frontier perf at fraction of cost
    {
      modelId: "mistral-medium-2505",
      provider: "mistral",
      displayName: "Mistral Medium 3",
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
      inputCostPer1kTokens: 0.0004, // $0.40 / 1M
      outputCostPer1kTokens: 0.002, // $2.00 / 1M
      capabilities: ["chat", "complete", "function_calling"],
    },
    // Mistral Small 3.2 — latest small, cost-efficient
    {
      modelId: "mistral-small-latest",
      provider: "mistral",
      displayName: "Mistral Small 3.2",
      contextWindow: 128_000,
      maxOutputTokens: 8_192,
      inputCostPer1kTokens: 0.0001, // $0.10 / 1M
      outputCostPer1kTokens: 0.0003, // $0.30 / 1M
      capabilities: ["chat", "complete"],
    },

    // ── Google Gemini ─────────────────────────────────────────────────────────
    // Gemini 3 Flash — outperforms Gemini 2.5 Pro on coding, 1M context
    {
      modelId: "gemini-3-flash",
      provider: "gemini",
      displayName: "Gemini 3 Flash",
      contextWindow: 1_000_000,
      maxOutputTokens: 8_192,
      inputCostPer1kTokens: 0.0005, // ~$0.50 / 1M (estimated, between 2.5 Flash and 3 Pro)
      outputCostPer1kTokens: 0.002,
      capabilities: ["chat", "complete", "vision", "function_calling"],
    },
    // Gemini 3.1 Flash-Lite — fastest, cheapest Gemini, 2.5× faster TTFB
    {
      modelId: "gemini-3.1-flash-lite",
      provider: "gemini",
      displayName: "Gemini 3.1 Flash-Lite",
      contextWindow: 1_000_000,
      maxOutputTokens: 8_192,
      inputCostPer1kTokens: 0.00025, // $0.25 / 1M
      outputCostPer1kTokens: 0.0015, // $1.50 / 1M
      capabilities: ["chat", "complete", "vision"],
    },
    // Gemini 2.5 Pro — still widely used, top LMArena score
    {
      modelId: "gemini-2.5-pro",
      provider: "gemini",
      displayName: "Gemini 2.5 Pro",
      contextWindow: 1_000_000,
      maxOutputTokens: 8_192,
      inputCostPer1kTokens: 0.00125, // $1.25 / 1M
      outputCostPer1kTokens: 0.01, // $10.00 / 1M
      capabilities: ["chat", "complete", "vision", "function_calling"],
    },
  ];

  for (const model of models) {
    const { provider, ...modelData } = model;
    await prisma.modelCatalog.upsert({
      where: { modelId: model.modelId },
      update: { ...modelData, providerId: providerIdMap[provider] },
      create: { ...modelData, providerId: providerIdMap[provider] },
    });
  }

  console.log("✅ Model catalog seeded");
  console.log("🎉 Seeding completed!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
