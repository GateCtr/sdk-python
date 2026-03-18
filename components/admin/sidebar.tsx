"use client";

/**
 * Admin Sidebar
 *
 * Renders navigation links filtered by the current user's permissions.
 * Each menu item declares the permission required to see it; items the
 * user cannot access are simply omitted.
 *
 * Requirements: 6.4, 6.5, 6.6, 6.7
 */

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { usePermissions } from "@/hooks/use-permissions";
import type { Permission } from "@/lib/permissions";

interface MenuItem {
  labelKey: string;
  href: string;
  permission: Permission;
}

const MENU_ITEMS: MenuItem[] = [
  { labelKey: "sidebar.users", href: "/admin/users", permission: "users:read" },
  {
    labelKey: "sidebar.plans",
    href: "/admin/plans",
    permission: "billing:read",
  },
  {
    labelKey: "sidebar.featureFlags",
    href: "/admin/feature-flags",
    permission: "system:read",
  },
  {
    labelKey: "sidebar.auditLogs",
    href: "/admin/audit-logs",
    permission: "audit:read",
  },
  {
    labelKey: "sidebar.systemHealth",
    href: "/admin/system",
    permission: "system:read",
  },
  {
    labelKey: "sidebar.waitlist",
    href: "/admin/waitlist",
    permission: "users:read",
  },
];

export function AdminSidebar() {
  const t = useTranslations("admin");
  const { data: permissions = [], isLoading } = usePermissions();

  const visibleItems = MENU_ITEMS.filter((item) =>
    permissions.includes(item.permission),
  );

  if (isLoading) return null;

  return (
    <nav aria-label={t("sidebar.users")}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {visibleItems.map((item) => (
          <li key={item.href}>
            <Link href={item.href as Parameters<typeof Link>[0]["href"]}>
              {t(item.labelKey as Parameters<typeof t>[0])}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
