/**
 * Unit Tests for Admin Audit Logs Page
 *
 * Tests that the page enforces audit:read permission, displays audit logs
 * from the database, and renders log entries with resource, action, and timestamp.
 *
 * Validates Requirements: 9.8
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  getAuditLogs: vi.fn(),
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
import { requirePermission } from "@/lib/auth";
import { getAuditLogs } from "@/lib/audit";
import AuditLogsPage from "@/app/[locale]/(admin)/admin/audit-logs/page";

const mockRequirePermission = vi.mocked(requirePermission);
const mockRedirect = vi.mocked(redirect);
const mockGetAuditLogs = vi.mocked(getAuditLogs);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLog(
  overrides: Partial<{
    id: string;
    userId: string | null;
    actorId: string | null;
    resource: string;
    action: string;
    resourceId: string | null;
    oldValue: null;
    newValue: null;
    ipAddress: string | null;
    userAgent: string | null;
    success: boolean;
    error: string | null;
    createdAt: Date;
    user: { id: string; email: string; name: string | null } | null;
  }> = {},
) {
  return {
    id: "log-1",
    userId: "user-1",
    actorId: null,
    resource: "user",
    action: "user.created",
    resourceId: null,
    oldValue: null,
    newValue: null,
    ipAddress: null,
    userAgent: null,
    success: true,
    error: null,
    createdAt: new Date("2024-06-01T12:00:00Z"),
    user: null,
    ...overrides,
  };
}

function makeAuditResult(
  logs: ReturnType<typeof makeLog>[],
  total = logs.length,
) {
  return {
    logs,
    total,
    page: 1,
    pageSize: 50,
    totalPages: Math.ceil(total / 50),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AuditLogsPage", () => {
  beforeEach(() => {
    mockRequirePermission.mockResolvedValue(undefined);
    mockGetAuditLogs.mockResolvedValue(makeAuditResult([]));
  });

  // Requirement 9.8 – page is protected by audit:read permission
  describe("access control", () => {
    it('calls requirePermission("audit:read") on every render', async () => {
      const page = await AuditLogsPage({ searchParams: Promise.resolve({}) });
      render(page);

      expect(mockRequirePermission).toHaveBeenCalledWith("audit:read");
    });

    it("redirects when requirePermission throws", async () => {
      mockRequirePermission.mockRejectedValue(
        new Error("Unauthorized: Missing required permission 'audit:read'"),
      );

      try {
        const page = await AuditLogsPage({ searchParams: Promise.resolve({}) });
        render(page);
      } catch {
        // redirect throws in test env
      }

      expect(mockRedirect).toHaveBeenCalledWith(
        "/dashboard?error=access_denied",
      );
    });
  });

  // Requirement 9.8 – audit logs are displayed correctly
  describe("log list rendering", () => {
    it("renders a row for each log returned from getAuditLogs", async () => {
      mockGetAuditLogs.mockResolvedValue(
        makeAuditResult([
          makeLog({ id: "l1", resource: "user", action: "user.created" }),
          makeLog({ id: "l2", resource: "role", action: "role.granted" }),
        ]),
      );

      const page = await AuditLogsPage({ searchParams: Promise.resolve({}) });
      render(page);

      expect(screen.getByText("user.created")).toBeInTheDocument();
      expect(screen.getByText("role.granted")).toBeInTheDocument();
    });

    it("renders resource and action for each log entry", async () => {
      mockGetAuditLogs.mockResolvedValue(
        makeAuditResult([
          makeLog({ resource: "webhook", action: "webhook.signature_failed" }),
        ]),
      );

      const page = await AuditLogsPage({ searchParams: Promise.resolve({}) });
      render(page);

      expect(screen.getByText("webhook")).toBeInTheDocument();
      expect(screen.getByText("webhook.signature_failed")).toBeInTheDocument();
    });

    it("renders the timestamp for each log entry", async () => {
      const createdAt = new Date("2024-06-01T12:00:00Z");
      mockGetAuditLogs.mockResolvedValue(
        makeAuditResult([makeLog({ createdAt })]),
      );

      const page = await AuditLogsPage({ searchParams: Promise.resolve({}) });
      render(page);

      // The page renders createdAt via toLocaleString() – just verify the cell exists
      const timestamp = createdAt.toLocaleString();
      expect(screen.getByText(timestamp)).toBeInTheDocument();
    });

    it("shows a dash for logs with no userId", async () => {
      mockGetAuditLogs.mockResolvedValue(
        makeAuditResult([makeLog({ userId: null })]),
      );

      const page = await AuditLogsPage({ searchParams: Promise.resolve({}) });
      render(page);

      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("shows the empty state when there are no logs", async () => {
      mockGetAuditLogs.mockResolvedValue(makeAuditResult([]));

      const page = await AuditLogsPage({ searchParams: Promise.resolve({}) });
      render(page);

      expect(screen.getByText("auditLogs.empty")).toBeInTheDocument();
    });

    it("displays the total entry count", async () => {
      mockGetAuditLogs.mockResolvedValue(makeAuditResult([makeLog()], 42));

      const page = await AuditLogsPage({ searchParams: Promise.resolve({}) });
      render(page);

      expect(screen.getByText(/42 total entries/)).toBeInTheDocument();
    });
  });

  // Requirement 9.8 – filtering / pagination
  describe("pagination", () => {
    it("passes page=1 by default when no searchParams provided", async () => {
      const page = await AuditLogsPage({ searchParams: Promise.resolve({}) });
      render(page);

      expect(mockGetAuditLogs).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ page: 1, pageSize: 50 }),
      );
    });

    it("passes the page number from searchParams", async () => {
      const page = await AuditLogsPage({
        searchParams: Promise.resolve({ page: "3" }),
      });
      render(page);

      expect(mockGetAuditLogs).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ page: 3 }),
      );
    });

    it("clamps invalid page values to 1", async () => {
      const page = await AuditLogsPage({
        searchParams: Promise.resolve({ page: "-5" }),
      });
      render(page);

      expect(mockGetAuditLogs).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ page: 1 }),
      );
    });
  });
});
