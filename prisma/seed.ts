import { prisma } from "../lib/prisma";

async function main() {
  console.log("🌱 Seeding database...");

  // Create default plans
  const freePlan = await prisma.plan.upsert({
    where: { name: "FREE" },
    update: {},
    create: {
      name: "FREE",
      displayName: "Free",
      description: "Perfect for testing and small projects",
      isActive: true,
      isPublic: true,
      sortOrder: 1,
      limits: {
        create: {
          maxTokensPerMonth: 100000,
          maxRequestsPerDay: 100,
          maxRequestsPerMinute: 10,
          maxProjects: 1,
          maxApiKeys: 2,
          maxWebhooks: 0,
          maxTeamMembers: 1,
          contextOptimizerEnabled: false,
          modelRouterEnabled: false,
          advancedAnalytics: false,
          auditLogsRetentionDays: 7,
          supportLevel: "community",
        },
      },
    },
  });

  const proPlan = await prisma.plan.upsert({
    where: { name: "PRO" },
    update: {},
    create: {
      name: "PRO",
      displayName: "Pro",
      description: "For professionals and growing teams",
      stripePriceIdMonthly: "price_pro_monthly",
      stripePriceIdYearly: "price_pro_yearly",
      isActive: true,
      isPublic: true,
      sortOrder: 2,
      limits: {
        create: {
          maxTokensPerMonth: 5000000,
          maxRequestsPerDay: 10000,
          maxRequestsPerMinute: 100,
          maxProjects: 10,
          maxApiKeys: 10,
          maxWebhooks: 5,
          maxTeamMembers: 5,
          contextOptimizerEnabled: true,
          modelRouterEnabled: true,
          advancedAnalytics: true,
          auditLogsRetentionDays: 30,
          supportLevel: "email",
        },
      },
    },
  });

  console.log("✅ Plans created:", { freePlan, proPlan });

  // Create default roles
  const roles: Array<{
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

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }

  console.log("✅ Roles created");

  // Create permissions
  const permissions = [
    // User management
    { resource: "user", action: "read", description: "View user information" },
    { resource: "user", action: "create", description: "Create new users" },
    {
      resource: "user",
      action: "update",
      description: "Update user information",
    },
    { resource: "user", action: "delete", description: "Delete users" },

    // Project management
    { resource: "project", action: "read", description: "View projects" },
    {
      resource: "project",
      action: "create",
      description: "Create new projects",
    },
    { resource: "project", action: "update", description: "Update projects" },
    { resource: "project", action: "delete", description: "Delete projects" },

    // API Key management
    { resource: "api_key", action: "read", description: "View API keys" },
    { resource: "api_key", action: "create", description: "Create API keys" },
    { resource: "api_key", action: "update", description: "Update API keys" },
    { resource: "api_key", action: "delete", description: "Delete API keys" },

    // Budget management
    { resource: "budget", action: "read", description: "View budgets" },
    { resource: "budget", action: "create", description: "Create budgets" },
    { resource: "budget", action: "update", description: "Update budgets" },
    { resource: "budget", action: "delete", description: "Delete budgets" },

    // Analytics
    { resource: "analytics", action: "read", description: "View analytics" },
    {
      resource: "analytics",
      action: "export",
      description: "Export analytics data",
    },

    // Webhooks
    { resource: "webhook", action: "read", description: "View webhooks" },
    { resource: "webhook", action: "create", description: "Create webhooks" },
    { resource: "webhook", action: "update", description: "Update webhooks" },
    { resource: "webhook", action: "delete", description: "Delete webhooks" },

    // Team management
    { resource: "team", action: "read", description: "View teams" },
    { resource: "team", action: "create", description: "Create teams" },
    { resource: "team", action: "update", description: "Update teams" },
    { resource: "team", action: "delete", description: "Delete teams" },
    { resource: "team", action: "invite", description: "Invite team members" },
    {
      resource: "team",
      action: "remove_member",
      description: "Remove team members",
    },

    // Billing
    {
      resource: "billing",
      action: "read",
      description: "View billing information",
    },
    {
      resource: "billing",
      action: "update",
      description: "Update billing information",
    },

    // Admin features
    { resource: "plan", action: "read", description: "View plans" },
    { resource: "plan", action: "create", description: "Create plans" },
    { resource: "plan", action: "update", description: "Update plans" },
    { resource: "plan", action: "delete", description: "Delete plans" },

    {
      resource: "feature_flag",
      action: "read",
      description: "View feature flags",
    },
    {
      resource: "feature_flag",
      action: "create",
      description: "Create feature flags",
    },
    {
      resource: "feature_flag",
      action: "update",
      description: "Update feature flags",
    },
    {
      resource: "feature_flag",
      action: "delete",
      description: "Delete feature flags",
    },

    { resource: "audit_log", action: "read", description: "View audit logs" },

    { resource: "system", action: "read", description: "View system health" },
    {
      resource: "system",
      action: "manage",
      description: "Manage system settings",
    },
  ];

  const createdPermissions: Record<
    string,
    { id: string; resource: string; action: string }
  > = {};
  for (const permission of permissions) {
    const created = await prisma.permission.upsert({
      where: {
        resource_action: {
          resource: permission.resource,
          action: permission.action,
        },
      },
      update: {},
      create: permission,
    });
    createdPermissions[`${permission.resource}:${permission.action}`] = created;
  }

  console.log("✅ Permissions created");

  // Get created roles
  const superAdminRole = await prisma.role.findUnique({
    where: { name: "SUPER_ADMIN" },
  });
  const adminRole = await prisma.role.findUnique({ where: { name: "ADMIN" } });
  const managerRole = await prisma.role.findUnique({
    where: { name: "MANAGER" },
  });
  const developerRole = await prisma.role.findUnique({
    where: { name: "DEVELOPER" },
  });
  const viewerRole = await prisma.role.findUnique({
    where: { name: "VIEWER" },
  });
  const supportRole = await prisma.role.findUnique({
    where: { name: "SUPPORT" },
  });

  // Assign permissions to roles
  const rolePermissions = [
    // SUPER_ADMIN - All permissions
    ...Object.values(createdPermissions).map((perm) => ({
      roleId: superAdminRole!.id,
      permissionId: perm.id,
    })),

    // ADMIN - Most permissions except system management
    { roleId: adminRole!.id, permissionId: createdPermissions["user:read"].id },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["user:create"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["user:update"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["project:read"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["project:create"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["project:update"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["project:delete"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["api_key:read"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["api_key:create"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["api_key:update"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["api_key:delete"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["budget:read"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["budget:create"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["budget:update"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["budget:delete"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["analytics:read"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["analytics:export"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["webhook:read"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["webhook:create"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["webhook:update"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["webhook:delete"].id,
    },
    { roleId: adminRole!.id, permissionId: createdPermissions["team:read"].id },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["team:create"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["team:update"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["team:delete"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["team:invite"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["team:remove_member"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["billing:read"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["billing:update"].id,
    },
    {
      roleId: adminRole!.id,
      permissionId: createdPermissions["audit_log:read"].id,
    },

    // MANAGER - Team and project management
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["user:read"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["project:read"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["project:create"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["project:update"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["api_key:read"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["api_key:create"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["budget:read"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["budget:update"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["analytics:read"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["webhook:read"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["webhook:create"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["webhook:update"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["team:read"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["team:invite"].id,
    },
    {
      roleId: managerRole!.id,
      permissionId: createdPermissions["billing:read"].id,
    },

    // DEVELOPER - Development access
    {
      roleId: developerRole!.id,
      permissionId: createdPermissions["project:read"].id,
    },
    {
      roleId: developerRole!.id,
      permissionId: createdPermissions["project:create"].id,
    },
    {
      roleId: developerRole!.id,
      permissionId: createdPermissions["project:update"].id,
    },
    {
      roleId: developerRole!.id,
      permissionId: createdPermissions["api_key:read"].id,
    },
    {
      roleId: developerRole!.id,
      permissionId: createdPermissions["api_key:create"].id,
    },
    {
      roleId: developerRole!.id,
      permissionId: createdPermissions["budget:read"].id,
    },
    {
      roleId: developerRole!.id,
      permissionId: createdPermissions["analytics:read"].id,
    },
    {
      roleId: developerRole!.id,
      permissionId: createdPermissions["webhook:read"].id,
    },
    {
      roleId: developerRole!.id,
      permissionId: createdPermissions["webhook:create"].id,
    },
    {
      roleId: developerRole!.id,
      permissionId: createdPermissions["team:read"].id,
    },

    // VIEWER - Read-only access
    {
      roleId: viewerRole!.id,
      permissionId: createdPermissions["project:read"].id,
    },
    {
      roleId: viewerRole!.id,
      permissionId: createdPermissions["api_key:read"].id,
    },
    {
      roleId: viewerRole!.id,
      permissionId: createdPermissions["budget:read"].id,
    },
    {
      roleId: viewerRole!.id,
      permissionId: createdPermissions["analytics:read"].id,
    },
    {
      roleId: viewerRole!.id,
      permissionId: createdPermissions["webhook:read"].id,
    },
    {
      roleId: viewerRole!.id,
      permissionId: createdPermissions["team:read"].id,
    },

    // SUPPORT - Support team access
    {
      roleId: supportRole!.id,
      permissionId: createdPermissions["user:read"].id,
    },
    {
      roleId: supportRole!.id,
      permissionId: createdPermissions["project:read"].id,
    },
    {
      roleId: supportRole!.id,
      permissionId: createdPermissions["analytics:read"].id,
    },
    {
      roleId: supportRole!.id,
      permissionId: createdPermissions["audit_log:read"].id,
    },
    {
      roleId: supportRole!.id,
      permissionId: createdPermissions["system:read"].id,
    },
  ];

  for (const rp of rolePermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: rp.roleId,
          permissionId: rp.permissionId,
        },
      },
      update: {},
      create: rp,
    });
  }

  console.log("✅ Role permissions assigned");

  // Create LLM Provider Configs
  const providers = [
    {
      provider: "openai",
      displayName: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      defaultTimeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
    },
    {
      provider: "anthropic",
      displayName: "Anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      defaultTimeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
    },
    {
      provider: "mistral",
      displayName: "Mistral AI",
      baseUrl: "https://api.mistral.ai/v1",
      defaultTimeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
    },
  ];

  for (const provider of providers) {
    await prisma.lLMProviderConfig.upsert({
      where: { provider: provider.provider },
      update: {},
      create: provider,
    });
  }

  console.log("✅ LLM Provider configs created");

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
