/**
 * Unit Tests for AdminLayout Component
 *
 * Tests that the admin layout renders correctly for admin users and
 * redirects non-admin users to the dashboard with an error query param.
 *
 * Validates Requirements: 6.2, 6.3
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminLayout from "@/components/admin/layout";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/components/admin/sidebar", () => ({
  AdminSidebar: () => <nav data-testid="admin-sidebar">Sidebar</nav>,
}));

import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRedirect = vi.mocked(redirect);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("admin user", () => {
    it("renders children when requireAdmin() resolves", async () => {
      mockRequireAdmin.mockResolvedValue(undefined);

      render(await AdminLayout({ children: <span>Admin page content</span> }));

      expect(screen.getByText("Admin page content")).toBeInTheDocument();
    });

    it("renders the AdminSidebar when requireAdmin() resolves", async () => {
      mockRequireAdmin.mockResolvedValue(undefined);

      render(await AdminLayout({ children: <div>Content</div> }));

      expect(screen.getByTestId("admin-sidebar")).toBeInTheDocument();
    });

    it("does not call redirect when requireAdmin() resolves", async () => {
      mockRequireAdmin.mockResolvedValue(undefined);

      render(await AdminLayout({ children: <div>Content</div> }));

      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });

  describe("non-admin user", () => {
    beforeEach(() => {
      // In real Next.js, redirect() throws a special NEXT_REDIRECT error to halt execution
      mockRedirect.mockImplementation(() => {
        throw new Error("NEXT_REDIRECT");
      });
    });

    it("redirects to /dashboard?error=access_denied when requireAdmin() throws", async () => {
      mockRequireAdmin.mockRejectedValue(
        new Error("Unauthorized: Admin access required"),
      );

      try {
        await AdminLayout({ children: <div>Content</div> });
      } catch {
        // expected
      }

      expect(mockRedirect).toHaveBeenCalledWith(
        "/dashboard?error=access_denied",
      );
    });

    it("does not render children when requireAdmin() throws", async () => {
      mockRequireAdmin.mockRejectedValue(
        new Error("Unauthorized: Admin access required"),
      );

      await expect(
        AdminLayout({ children: <span>Admin page content</span> }),
      ).rejects.toThrow("NEXT_REDIRECT");
    });

    it("redirects to /fr/dashboard?error=access_denied for French locale", async () => {
      mockRequireAdmin.mockRejectedValue(
        new Error("Unauthorized: Admin access required"),
      );

      try {
        await AdminLayout({ children: <div>Content</div>, locale: "fr" });
      } catch {
        // expected
      }

      expect(mockRedirect).toHaveBeenCalledWith(
        "/fr/dashboard?error=access_denied",
      );
    });

    it("defaults to English redirect when no locale is provided", async () => {
      mockRequireAdmin.mockRejectedValue(
        new Error("Unauthorized: Admin access required"),
      );

      try {
        await AdminLayout({ children: <div>Content</div> });
      } catch {
        // expected
      }

      expect(mockRedirect).toHaveBeenCalledWith(
        "/dashboard?error=access_denied",
      );
    });
  });
});
