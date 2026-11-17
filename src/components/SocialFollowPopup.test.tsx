import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SocialFollowPopup, { FACEBOOK_URL, INSTAGRAM_URL, SOCIAL_FOLLOW_PROMPT_KEY } from "./SocialFollowPopup";

describe("SocialFollowPopup", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); host = document.createElement("div"); document.body.appendChild(host); });
  afterEach(() => { act(() => root?.unmount()); host.remove(); vi.useRealTimers(); });

  it("toont Facebook en Instagram eenmaal en onthoudt sluiten", () => {
    root = createRoot(host);
    act(() => root.render(<SocialFollowPopup />));
    act(() => vi.advanceTimersByTime(1500));
    const links = [...host.querySelectorAll("a")];
    expect(links.map((link) => link.href)).toEqual(expect.arrayContaining([FACEBOOK_URL, INSTAGRAM_URL]));
    const close = host.querySelector('button[aria-label="Sluiten"]') as HTMLButtonElement;
    act(() => close.click());
    expect(localStorage.getItem(SOCIAL_FOLLOW_PROMPT_KEY)).toBe("seen");
  });

  it("blijft verborgen wanneer de popup eerder is gezien", () => {
    localStorage.setItem(SOCIAL_FOLLOW_PROMPT_KEY, "seen");
    root = createRoot(host);
    act(() => root.render(<SocialFollowPopup />));
    act(() => vi.advanceTimersByTime(2000));
    expect(host.textContent).toBe("");
  });
});
