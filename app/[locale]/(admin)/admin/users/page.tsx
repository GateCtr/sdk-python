import { redirect } from "next/navigation";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "admin.metadata.users",
  });
  return { title: t("title"), description: t("description") };
}

/**
 * Admin User Management Page (Server Component)
 * Requirements: 6.1, 6.2, 6.5
 */
export default async function AdminUsersPage() {
  // Server-side access control
  try {
    await requireAdmin();
  } catch {
    redirect("/dashboard?error=access_denied");
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      createdAt: true,
      userRoles: {
        select: { role: { select: { name: true, displayName: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return <UserManagementView users={users} />;
}

// ─── Client-renderable view ───────────────────────────────────────────────────

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
  createdAt: Date;
  userRoles: { role: { name: string; displayName: string } }[];
};

function UserManagementView({ users }: { users: UserRow[] }) {
  const t = useTranslations("admin");

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">{t("users.title")}</h1>
      <p className="text-muted-foreground mb-8">{t("users.subtitle")}</p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {(["name", "email", "roles", "status", "joined"] as const).map(
                (col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left font-medium text-muted-foreground uppercase tracking-wider text-xs"
                  >
                    {t(`users.table.${col}`)}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {t("users.empty")}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{user.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.userRoles.map(({ role }) => (
                        <Badge
                          key={role.name}
                          variant="secondary"
                          className="text-xs"
                        >
                          {role.displayName}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={user.isActive ? "default" : "outline"}>
                      {user.isActive
                        ? t("users.status.active")
                        : t("users.status.inactive")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
