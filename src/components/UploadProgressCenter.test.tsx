import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import UploadProgressCenter from "./UploadProgressCenter";
import { UPLOAD_PROGRESS_EVENT } from "@/integrations/appwrite/client";

function report(detail: {
  id: string;
  name: string;
  path: string;
  percent: number;
  status: "uploading" | "completed" | "failed";
  error?: string;
}) {
  act(() => window.dispatchEvent(new CustomEvent(UPLOAD_PROGRESS_EVENT, { detail })));
}

describe("UploadProgressCenter", () => {
  it("toont de bestandsnaam en werkelijke voortgang tot de upload klaar is", () => {
    render(<UploadProgressCenter />);

    report({ id: "upload-1", name: "voorbeeld.jpg", path: "orders/voorbeeld.jpg", percent: 37, status: "uploading" });
    expect(screen.getByText("voorbeeld.jpg")).toBeInTheDocument();
    expect(screen.getByText("37%")).toBeInTheDocument();
    expect(screen.getByText("37% geüpload")).toBeInTheDocument();

    report({ id: "upload-1", name: "voorbeeld.jpg", path: "orders/voorbeeld.jpg", percent: 100, status: "completed" });
    expect(screen.getByText("Geüpload")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uploadlijst sluiten" })).toBeInTheDocument();
  });

  it("laat een uploadfout met de bijbehorende bestandsnaam staan", () => {
    render(<UploadProgressCenter />);

    report({ id: "upload-2", name: "model.3mf", path: "orders/model.3mf", percent: 62, status: "failed", error: "Verbinding verbroken" });
    expect(screen.getByText("model.3mf")).toBeInTheDocument();
    expect(screen.getByText("Verbinding verbroken")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Uploadlijst sluiten" }));
    expect(screen.queryByLabelText("Uploadvoortgang")).not.toBeInTheDocument();
  });
});
