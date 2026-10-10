import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { ScrollToTop } from "./ScrollToTop";

function Navigation() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/bestellen")}>Open bestellen</button>;
}

afterEach(() => vi.restoreAllMocks());

describe("ScrollToTop", () => {
  it("scrollt bij het openen van een andere pagina naar boven", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<MemoryRouter initialEntries={["/faq"]}><ScrollToTop /><Navigation /></MemoryRouter>);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    fireEvent.click(screen.getByRole("button", { name: "Open bestellen" }));
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
});
