import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterSignupForm } from "./NewsletterSignupForm";
import { subscribeToNewsletter } from "@/lib/newsletter";

vi.mock("@/lib/newsletter", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/newsletter")>();

  return {
    ...original,
    subscribeToNewsletter: vi.fn(),
  };
});

function changeInput(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("NewsletterSignupForm", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.mocked(subscribeToNewsletter).mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  const renderForm = (onSubscribed?: () => void) => {
    act(() => root.render(<NewsletterSignupForm onSubscribed={onSubscribed} source="popup" />));
    return {
      form: container.querySelector("form") as HTMLFormElement,
      input: container.querySelector('input[name="email"]') as HTMLInputElement,
    };
  };

  const submit = async (form: HTMLFormElement) => {
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
  };

  it("blocks an invalid email before calling Supabase", async () => {
    const { form, input } = renderForm();
    act(() => changeInput(input, "geen-email"));

    await submit(form);

    expect(container.querySelector('[role="alert"]')).toHaveTextContent("Vul een geldig e-mailadres in.");
    expect(subscribeToNewsletter).not.toHaveBeenCalled();
  });

  it("submits a valid signup with its source", async () => {
    const onSubscribed = vi.fn();
    const { form, input } = renderForm(onSubscribed);
    act(() => changeInput(input, " Klant@Voorbeeld.NL "));

    await submit(form);

    expect(subscribeToNewsletter).toHaveBeenCalledWith("Klant@Voorbeeld.NL", "popup");
    expect(onSubscribed).toHaveBeenCalledOnce();
    expect(input).toHaveValue("");
  });

  it("keeps the email and shows a useful error when storage fails", async () => {
    vi.mocked(subscribeToNewsletter).mockRejectedValueOnce(new Error("Aanmelden is nu niet gelukt."));
    const { form, input } = renderForm();
    act(() => changeInput(input, "klant@voorbeeld.nl"));

    await submit(form);

    expect(container.querySelector('[role="alert"]')).toHaveTextContent("Aanmelden is nu niet gelukt.");
    expect(input).toHaveValue("klant@voorbeeld.nl");
  });
});
