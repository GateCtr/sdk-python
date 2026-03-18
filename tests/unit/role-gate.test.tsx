/**
 * Unit Tests for RoleGate Component
 *
 * Tests that RoleGate renders children when the user has the required role(s),
 * renders fallback (or null) when they don't, and handles requireAll correctly.
 *
 * Validates Requirements: 6.2
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleGate } from "@/components/auth/role-gate";

// Mock the hooks/use-roles module
vi.mock("@/hooks/use-roles", () => ({
  useRoles: vi.fn(),
}));

import { useRoles } from "@/hooks/use-roles";

const mockUseRoles = vi.mocked(useRoles);

// Helper to create a partial mock that satisfies the ReturnType constraint
function mockRolesResult(
  data: ReturnType<typeof useRoles>["data"],
  isLoading: boolean,
) {
  return { data, isLoading } as unknown as ReturnType<typeof useRoles>;
}

describe("RoleGate", () => {
  it("renders children when user has the required role", () => {
    mockUseRoles.mockReturnValue(mockRolesResult(["ADMIN"], false));

    render(
      <RoleGate roles={["ADMIN"]}>
        <span>Admin content</span>
      </RoleGate>,
    );

    expect(screen.getByText("Admin content")).toBeInTheDocument();
  });

  it("renders fallback when user lacks the required role", () => {
    mockUseRoles.mockReturnValue(mockRolesResult(["VIEWER"], false));

    render(
      <RoleGate roles={["ADMIN"]} fallback={<span>Access denied</span>}>
        <span>Admin content</span>
      </RoleGate>,
    );

    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
    expect(screen.getByText("Access denied")).toBeInTheDocument();
  });

  it("renders null when user lacks role and no fallback is provided", () => {
    mockUseRoles.mockReturnValue(mockRolesResult(["VIEWER"], false));

    const { container } = render(
      <RoleGate roles={["ADMIN"]}>
        <span>Admin content</span>
      </RoleGate>,
    );

    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("requireAll=false (default) renders children if user has ANY of the roles", () => {
    mockUseRoles.mockReturnValue(mockRolesResult(["MANAGER"], false));

    render(
      <RoleGate roles={["ADMIN", "MANAGER"]}>
        <span>Partial access content</span>
      </RoleGate>,
    );

    expect(screen.getByText("Partial access content")).toBeInTheDocument();
  });

  it("requireAll=false renders fallback when user has none of the roles", () => {
    mockUseRoles.mockReturnValue(mockRolesResult(["VIEWER"], false));

    render(
      <RoleGate roles={["ADMIN", "MANAGER"]} fallback={<span>No access</span>}>
        <span>Partial access content</span>
      </RoleGate>,
    );

    expect(
      screen.queryByText("Partial access content"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("No access")).toBeInTheDocument();
  });

  it("requireAll=true renders children only when user has ALL of the roles", () => {
    mockUseRoles.mockReturnValue(
      mockRolesResult(["ADMIN", "SUPER_ADMIN"], false),
    );

    render(
      <RoleGate roles={["ADMIN", "SUPER_ADMIN"]} requireAll>
        <span>Super admin content</span>
      </RoleGate>,
    );

    expect(screen.getByText("Super admin content")).toBeInTheDocument();
  });

  it("requireAll=true renders fallback when user has only some of the roles", () => {
    mockUseRoles.mockReturnValue(mockRolesResult(["ADMIN"], false));

    render(
      <RoleGate
        roles={["ADMIN", "SUPER_ADMIN"]}
        requireAll
        fallback={<span>Insufficient roles</span>}
      >
        <span>Super admin content</span>
      </RoleGate>,
    );

    expect(screen.queryByText("Super admin content")).not.toBeInTheDocument();
    expect(screen.getByText("Insufficient roles")).toBeInTheDocument();
  });

  it("renders null while roles are loading", () => {
    mockUseRoles.mockReturnValue(mockRolesResult(undefined, true));

    const { container } = render(
      <RoleGate roles={["ADMIN"]} fallback={<span>Access denied</span>}>
        <span>Admin content</span>
      </RoleGate>,
    );

    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
    expect(screen.queryByText("Access denied")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });
});
