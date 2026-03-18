"use client";

/**
 * Role checking hooks
 *
 * Client-side hooks that fetch and cache the current user's roles
 * from /api/auth/roles using TanStack Query.
 *
 * Requirements: 4.1, 6.2
 */

import { useQuery } from "@tanstack/react-query";
import type { RoleName } from "@/lib/permissions";

// ─── Core fetcher ─────────────────────────────────────────────────────────────

async function fetchRoles(): Promise<RoleName[]> {
  const res = await fetch("/api/auth/roles");
  if (!res.ok) return [];
  const data = await res.json();
  return data.roles ?? [];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns the full list of role names for the current user.
 * Cached for 5 minutes — same TTL as the permission cache.
 */
export function useRoles() {
  return useQuery<RoleName[]>({
    queryKey: ["roles"],
    queryFn: fetchRoles,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Returns true if the current user has the given role.
 */
export function useHasRole(role: RoleName): boolean {
  const { data: roles } = useRoles();
  return roles?.includes(role) ?? false;
}

/**
 * Returns true if the current user has SUPER_ADMIN or ADMIN role.
 */
export function useIsAdmin(): boolean {
  const { data: roles } = useRoles();
  return roles?.some((r) => r === "SUPER_ADMIN" || r === "ADMIN") ?? false;
}
