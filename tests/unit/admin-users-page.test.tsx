/**
 * Unit Tests for Admin User Management Page
 *
 * Tests that the page enforces admin-only access, displays users from the
 * database, and renders role badges correctly.
 *
 * Validates Requirements: 6.2, 6.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// Mock next-intl – useTranslations returns a simple key-passthrough function
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AdminUsersPage from "@/app/[locale]/(admin)/admin/users/page";

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRedirect = vi.mocked(redirect);
const mockFindMany = vi.mocked(prisma.user.findMany);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(
  overrides: Partial<{
    id: string;
    clerkId: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
    plan: "FREE" | "PRO" | "TEAM" | "ENTERPRISE";
    planExpiresAt: Date | null;
    isActive: boolean;
    isBanned: boolean;
    bannedReason: string | null;
    metadata: null;
    createdAt: Date;
    updatedAt: Date;
    userRoles: { role: { name: string; displayName: string } }[];
  }> = {},
) {
  return {
    id: "user-1",
    clerkId: "clerk_user1",
    name: "Alice",
    email: "alice@example.com",
    avatarUrl: null,
    plan: "FREE" as const,
    planExpiresAt: null,
    isActive: true,
    isBanned: false,
    bannedReason: null,
    metadata: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    userRoles: [],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AdminUsersPage", () => {
  beforeEach(() => {
    mockRequireAdmin.mockResolvedValue(undefined);
    mockFindMany.mockResolvedValue([]);
  });

  // Requirement 6.2 – page is protected by admin role check
  describe("access control", () => {
    it("calls requireAdmin() on every render", async () => {
      const page = await AdminUsersPage();
      render(page);

      expect(mockRequireAdmin).toHaveBeenCalledOnce();
    });

    it("redirects non-admin users when requireAdmin throws", async () => {
      mockRequireAdmin.mockRejectedValue(
        new Error("Unauthorized: Admin access required"),
      );

      // redirect() in Next.js throws internally; we catch it here
      try {
        const page = await AdminUsersPage();
        render(page);
      } catch {
        // redirect throws in test env – that's fine
      }

      expect(mockRedirect).toHaveBeenCalledWith(
        "/dashboard?error=access_denied",
      );
    });
  });

  // Requirement 6.5 – users are displayed correctly
  describe("user list rendering", () => {
    it("renders a row for each user returned from the database", async () => {
      mockFindMany.mockResolvedValue([
        makeUser({ id: "u1", name: "Alice", email: "alice@example.com" }),
        makeUser({ id: "u2", name: "Bob", email: "bob@example.com" }),
      ]);

      const page = await AdminUsersPage();
      render(page);

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    });

    it("renders a dash for users with no name", async () => {
      mockFindMany.mockResolvedValue([makeUser({ name: null })]);

      const page = await AdminUsersPage();
      render(page);

      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("shows role badges for each role assigned to a user", async () => {
      mockFindMany.mockResolvedValue([
        makeUser({
          userRoles: [
            { role: { name: "ADMIN", displayName: "Admin" } },
            { role: { name: "MANAGER", displayName: "Manager" } },
          ],
        }),
      ]);

      const page = await AdminUsersPage();
      render(page);

      expect(screen.getByText("Admin")).toBeInTheDocument();
      expect(screen.getByText("Manager")).toBeInTheDocument();
    });

    it("shows no role badges when user has no roles", async () => {
      mockFindMany.mockResolvedValue([makeUser({ userRoles: [] })]);

      const page = await AdminUsersPage();
      render(page);

      // The role cell should be empty – no badge text from roles
      expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    });

    it("queries the database with the correct shape", async () => {
      const page = await AdminUsersPage();
      render(page);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            email: true,
            userRoles: expect.anything(),
          }),
        }),
      );
    });
  });
});
