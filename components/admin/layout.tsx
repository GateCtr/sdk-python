/**
 * Admin Layout (Server Component)
 *
 * Performs server-side role verification via requireAdmin() before rendering.
 * Unauthorized users are redirected to /dashboard with an error query param.
 *
 * Requirements: 6.2, 6.3, 6.8
 */

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/sidebar";
import { Header } from "@/components/shared/header";
import { Footer } from "@/components/shared/footer";

interface AdminLayoutProps {
  children: React.ReactNode;
  /** Locale is forwarded so the redirect preserves the user's language. */
  locale?: string;
}

export default async function AdminLayout({
  children,
  locale = "en",
}: AdminLayoutProps) {
  try {
    await requireAdmin();
  } catch {
    const dashboardPath = locale === "fr" ? "/fr/dashboard" : "/dashboard";
    redirect(`${dashboardPath}?error=access_denied`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header variant="dashboard" />
      <div className="flex flex-1">
        <aside className="w-60 shrink-0 border-r border-border bg-sidebar">
          <AdminSidebar />
        </aside>
        <main className="flex-1 overflow-auto pt-8 pb-12">{children}</main>
      </div>
      <Footer variant="minimal" />
    </div>
  );
}
