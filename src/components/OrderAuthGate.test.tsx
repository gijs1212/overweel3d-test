import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderAuthGate } from "./OrderAuthGate";

const mocks = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  toast: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

describe("OrderAuthGate", () => {
  beforeEach(() => {
    mocks.auth = {
      user: null,
      profile: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
    };
    mocks.toast.mockReset();
  });

  afterEach(cleanup);

  it("laat het winkelmandje zonder login gebruiken", () => {
    render(<OrderAuthGate active={false} onBackToCart={vi.fn()}><p>Winkelmandje vullen</p></OrderAuthGate>);
    expect(screen.getByText("Winkelmandje vullen")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("vraagt pas bij de gegevensstap om in te loggen", () => {
    render(<OrderAuthGate active onBackToCart={vi.fn()}><p>Uw gegevens</p></OrderAuthGate>);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Log in voor uw bestelgegevens")).toBeVisible();
  });

  it("laat een ingelogde gebruiker zonder volledig profiel direct gegevens invullen", () => {
    mocks.auth = { ...mocks.auth, user: { id: "user-1", email: "klant@example.nl" }, profile: null };
    render(<OrderAuthGate active onBackToCart={vi.fn()}><p>Uw gegevens</p></OrderAuthGate>);
    expect(screen.getByText("Uw gegevens")).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
