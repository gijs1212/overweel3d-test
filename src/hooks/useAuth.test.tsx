import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./useAuth";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: mocks.unsubscribe } },
      })),
    },
    from: vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        single: vi.fn(async () => ({
          data: {
            id: "profile-1",
            user_id: "user-1",
            full_name: "Admin Test",
            email: "admin@example.nl",
          },
          error: null,
        })),
      };
      return query;
    }),
  },
}));

function AuthState() {
  const { isAdmin, loading, user } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="admin">{String(isAdmin)}</span>
      <span data-testid="user">{user?.email ?? "geen"}</span>
    </div>
  );
}

function sessionWithRole(role: "admin" | "customer") {
  return {
    access_token: "token",
    token_type: "bearer",
    user: {
      id: "user-1",
      email: "admin@example.nl",
      app_metadata: { role },
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

describe("AuthProvider", () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.unsubscribe.mockReset();
  });

  afterEach(cleanup);

  it("controleert de opgeslagen sessie en adminrol wanneer de website opent", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: sessionWithRole("admin") },
      error: null,
    });

    render(<AuthProvider><AuthState /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(mocks.getSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("admin")).toHaveTextContent("true");
    expect(screen.getByTestId("user")).toHaveTextContent("admin@example.nl");
  });

  it("controleert de rol opnieuw wanneer de website weer actief wordt", async () => {
    mocks.getSession
      .mockResolvedValueOnce({ data: { session: sessionWithRole("admin") }, error: null })
      .mockResolvedValueOnce({ data: { session: sessionWithRole("customer") }, error: null });

    render(<AuthProvider><AuthState /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("admin")).toHaveTextContent("true"));

    window.dispatchEvent(new Event("focus"));

    await waitFor(() => expect(screen.getByTestId("admin")).toHaveTextContent("false"));
    expect(mocks.getSession).toHaveBeenCalledTimes(2);
  });
});
