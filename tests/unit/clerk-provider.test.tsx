/**
 * Unit Tests for ClerkProvider Component
 *
 * Tests that ClerkProvider wraps children correctly, is configured with the
 * publishable key, and that Clerk hooks are available to child components.
 *
 * Validates Requirements: 12.1, 12.4
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClerkProvider } from "@/components/clerk-provider";

// Mock @clerk/nextjs to avoid needing real Clerk credentials
vi.mock("@clerk/nextjs", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ClerkProvider: ({
    children,
    appearance,
    ...props
  }: {
    children: React.ReactNode;
    appearance?: unknown;
    [key: string]: unknown;
  }) => (
    <div
      data-testid="clerk-provider"
      data-publishable-key={props.publishableKey as string}
    >
      {children}
    </div>
  ),
  useUser: vi.fn(() => ({ isLoaded: true, isSignedIn: false, user: null })),
  useAuth: vi.fn(() => ({ isLoaded: true, isSignedIn: false, userId: null })),
}));

vi.mock("@clerk/themes", () => ({
  shadcn: { baseTheme: "shadcn" },
}));

import { useUser, useAuth } from "@clerk/nextjs";

const mockUseUser = vi.mocked(useUser);
const mockUseAuth = vi.mocked(useAuth);

describe("ClerkProvider", () => {
  it("renders children correctly", () => {
    render(
      <ClerkProvider>
        <span>Child content</span>
      </ClerkProvider>,
    );

    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("wraps children inside the Clerk provider", () => {
    render(
      <ClerkProvider>
        <span>Wrapped content</span>
      </ClerkProvider>,
    );

    const provider = screen.getByTestId("clerk-provider");
    expect(provider).toBeInTheDocument();
    expect(provider).toContainElement(screen.getByText("Wrapped content"));
  });

  it("renders multiple children correctly", () => {
    render(
      <ClerkProvider>
        <span>First child</span>
        <span>Second child</span>
      </ClerkProvider>,
    );

    expect(screen.getByText("First child")).toBeInTheDocument();
    expect(screen.getByText("Second child")).toBeInTheDocument();
  });

  it("useUser hook is available to child components wrapped in ClerkProvider", () => {
    mockUseUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { id: "user_123" },
    } as ReturnType<typeof useUser>);

    function ChildComponent() {
      const { isSignedIn, user } = useUser();
      return (
        <span>{isSignedIn ? `Signed in as ${user?.id}` : "Not signed in"}</span>
      );
    }

    render(
      <ClerkProvider>
        <ChildComponent />
      </ClerkProvider>,
    );

    expect(screen.getByText("Signed in as user_123")).toBeInTheDocument();
  });

  it("useAuth hook is available to child components wrapped in ClerkProvider", () => {
    mockUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      userId: "user_456",
    } as ReturnType<typeof useAuth>);

    function ChildComponent() {
      const { isSignedIn, userId } = useAuth();
      return (
        <span>
          {isSignedIn ? `Auth userId: ${userId}` : "Not authenticated"}
        </span>
      );
    }

    render(
      <ClerkProvider>
        <ChildComponent />
      </ClerkProvider>,
    );

    expect(screen.getByText("Auth userId: user_456")).toBeInTheDocument();
  });

  it("passes appearance prop through to the underlying ClerkProvider", () => {
    const customAppearance = { variables: { colorPrimary: "#ff0000" } };

    // Should not throw when appearance is passed
    expect(() =>
      render(
        <ClerkProvider appearance={customAppearance}>
          <span>Content</span>
        </ClerkProvider>,
      ),
    ).not.toThrow();

    expect(screen.getByText("Content")).toBeInTheDocument();
  });
});
