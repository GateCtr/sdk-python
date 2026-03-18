/**
 * Unit Tests for PermissionGate Component
 *
 * Tests that PermissionGate renders children when the user has the required
 * permission, renders fallback (or null) when they don't, and handles the
 * loading state correctly.
 *
 * Validates Requirements: 5.1, 5.2
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermissionGate } from "@/components/auth/permission-gate";

// Mock the hooks/use-permissions module
vi.mock("@/hooks/use-permissions", () => ({
  usePermissions: vi.fn(),
  useHasPermission: vi.fn(),
}));

import { usePermissions, useHasPermission } from "@/hooks/use-permissions";

const mockUsePermissions = vi.mocked(usePermissions);
const mockUseHasPermission = vi.mocked(useHasPermission);

describe("PermissionGate", () => {
  it("renders children when user has the required permission", () => {
    mockUsePermissions.mockReturnValue({ isLoading: false } as ReturnType<
      typeof usePermissions
    >);
    mockUseHasPermission.mockReturnValue(true);

    render(
      <PermissionGate permission="users:read">
        <span>Protected content</span>
      </PermissionGate>,
    );

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("renders fallback when user lacks the required permission", () => {
    mockUsePermissions.mockReturnValue({ isLoading: false } as ReturnType<
      typeof usePermissions
    >);
    mockUseHasPermission.mockReturnValue(false);

    render(
      <PermissionGate
        permission="users:read"
        fallback={<span>Access denied</span>}
      >
        <span>Protected content</span>
      </PermissionGate>,
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });

  it("renders null (not fallback) when user lacks permission and no fallback is provided", () => {
    mockUsePermissions.mockReturnValue({ isLoading: false } as ReturnType<
      typeof usePermissions
    >);
    mockUseHasPermission.mockReturnValue(false);

    const { container } = render(
      <PermissionGate permission="users:read">
        <span>Protected content</span>
      </PermissionGate>,
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("renders null while permissions are loading (regardless of permission value)", () => {
    mockUsePermissions.mockReturnValue({ isLoading: true } as ReturnType<
      typeof usePermissions
    >);
    mockUseHasPermission.mockReturnValue(true);

    const { container } = render(
      <PermissionGate
        permission="users:read"
        fallback={<span>Access denied</span>}
      >
        <span>Protected content</span>
      </PermissionGate>,
    );

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(screen.queryByText("Access denied")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });
});
