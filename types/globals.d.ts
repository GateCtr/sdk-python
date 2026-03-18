export {};

export type RoleName =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "MANAGER"
  | "DEVELOPER"
  | "VIEWER"
  | "SUPPORT";

export type PermissionName =
  | "users:read"
  | "users:write"
  | "users:delete"
  | "analytics:read"
  | "analytics:export"
  | "billing:read"
  | "billing:write"
  | "system:read"
  | "audit:read";

declare global {
  interface CustomJwtSessionClaims {
    publicMetadata: {
      onboardingComplete?: boolean;
      role?: RoleName;
      orgName?: string;
      usageType?: string;
      useCase?: string;
      teamSize?: string;
    };
  }
}
