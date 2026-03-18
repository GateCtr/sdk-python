"use client";

/**
 * RoleGate
 *
 * Renders children only when the current user has the required role(s).
 * Use `requireAll` to demand every listed role (AND), or leave it false
 * to allow any one of them (OR, the default).
 *
 * Requirements: 6.2
 */

import type { RoleName } from "@/lib/permissions";
import { useRoles } from "@/hooks/use-roles";

interface RoleGateProps {
  roles: RoleName[];
  /** When true, the user must have ALL listed roles. Defaults to false (any). */
  requireAll?: boolean;
  /** Content to render when the user lacks the required role(s). Defaults to null. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RoleGate({
  roles,
  requireAll = false,
  fallback = null,
  children,
}: RoleGateProps) {
  const { data: userRoles, isLoading } = useRoles();

  if (isLoading) return null;

  const authorized = requireAll
    ? roles.every((r) => userRoles?.includes(r))
    : roles.some((r) => userRoles?.includes(r));

  return authorized ? <>{children}</> : <>{fallback}</>;
}
