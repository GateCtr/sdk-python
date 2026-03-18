"use client";

/**
 * PermissionGate
 *
 * Renders children only when the current user has the required permission.
 * Falls back to the optional `fallback` prop (or nothing) otherwise.
 *
 * Requirements: 5.1, 5.2
 */

import type { Permission } from "@/lib/permissions";
import { useHasPermission, usePermissions } from "@/hooks/use-permissions";

interface PermissionGateProps {
  permission: Permission;
  /** Content to render when the user lacks the permission. Defaults to null. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({
  permission,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { isLoading } = usePermissions();
  const hasPermission = useHasPermission(permission);

  if (isLoading) return null;
  return hasPermission ? <>{children}</> : <>{fallback}</>;
}
