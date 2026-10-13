import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./button";

describe("Button", () => {
  it("verzendt een formulier niet zonder expliciet submit-type", () => {
    render(<form><Button>Upload kiezen</Button></form>);
    expect(screen.getByRole("button", { name: "Upload kiezen" })).toHaveAttribute("type", "button");
  });

  it("behoudt expliciete submit-knoppen", () => {
    render(<Button type="submit">Versturen</Button>);
    expect(screen.getByRole("button", { name: "Versturen" })).toHaveAttribute("type", "submit");
  });
});
