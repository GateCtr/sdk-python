"use client";

/**
 * Permission checking hooks
 *
 * Client-side hooks that fetch and cache the current user's permissions
 * from /api/auth/permissions using TanStack Query.
 *
 * Requirements: 5.1, 5.2, 5.5, 5.6
 */

import { useQuery } from "@tanstack/react-query";
import type { Permission } from "@/lib/permissions";

// ─── Core fetcher ─────────────────────────────────────────────────────────────

async function fetchPermissions(): Promise<Permission[]> {
  const res = await fetch("/api/auth/permissions");
  if (!res.ok) return [];
  const data = await res.json();
  return data.permissions ?? [];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns the full list of permissions for the current user.
 * Results are cached for 5 minutes (matching the server-side Redis TTL).
 */
export function usePermissions() {
  return useQuery<Permission[]>({
    queryKey: ["permissions"],
    queryFn: fetchPermissions,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Returns true if the current user has the given permission.
 */
export function useHasPermission(permission: Permission): boolean {
  const { data: permissions } = usePermissions();
  return permissions?.includes(permission) ?? false;
}

/**
 * Returns true if the current user has at least one of the given permissions.
 */
export function useHasAnyPermission(
  requiredPermissions: Permission[],
): boolean {
  const { data: permissions } = usePermissions();
  return requiredPermissions.some((p) => permissions?.includes(p)) ?? false;
}
