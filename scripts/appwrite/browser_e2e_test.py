#!/usr/bin/env python3
"""Read-only desktop/mobile browser smoke test for the Appwrite frontend."""

from __future__ import annotations

import json
from pathlib import Path
from playwright.sync_api import sync_playwright


BASE_URL = "http://127.0.0.1:5175"
ROUTES = ["/", "/bestellen", "/kleuren", "/opdrachten", "/faq", "/contact", "/voorwaarden", "/login"]


def run_viewport(browser, name: str, viewport: dict[str, int]) -> dict:
    context = browser.new_context(viewport=viewport, locale="nl-NL")
    page = context.new_page()
    console_errors: list[str] = []
    page_errors: list[str] = []
    failed_requests: list[str] = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))
    page.on("requestfailed", lambda req: failed_requests.append(f"{req.method} {req.url}: {req.failure}"))

    page.goto(BASE_URL, wait_until="networkidle")
    page.evaluate("localStorage.clear(); sessionStorage.clear()")
    page.reload(wait_until="networkidle")

    social = page.get_by_role("dialog", name="Volg Overweel3D")
    social.wait_for(state="visible", timeout=4000)
    assert "facebook.com/profile.php?id=61595120037678" in social.get_by_role("link", name="Facebook").get_attribute("href")
    assert "instagram.com/overweel3d" in social.get_by_role("link", name="Instagram").get_attribute("href")
    social.get_by_role("button", name="Sluiten").click()

    cookie = page.get_by_role("dialog", name="Uw cookievoorkeur")
    if cookie.count() and cookie.is_visible():
        cookie.get_by_role("button", name="Alleen noodzakelijk").click()

    checked = []
    newsletter_hits = []
    overflow = []
    broken_public_media = []
    for route in ROUTES:
        page.goto(BASE_URL + route, wait_until="networkidle")
        assert page.locator("body").is_visible(), route
        body_text = page.locator("body").inner_text().lower()
        if "nieuwsbrief" in body_text or "newsletter" in body_text:
            newsletter_hits.append(route)
        width = page.evaluate("document.documentElement.scrollWidth")
        if width > viewport["width"] + 2:
            overflow.append({"route": route, "scrollWidth": width})
        for image in page.locator("img").all():
            if not image.is_visible():
                continue
            src = image.get_attribute("src") or ""
            natural_width = image.evaluate("el => el.naturalWidth")
            if src and natural_width == 0 and not src.startswith("data:"):
                broken_public_media.append({"route": route, "src": src})
        checked.append(route)

    page.goto(BASE_URL + "/bestellen", wait_until="networkidle")
    page.get_by_role("tab", name="Bestand", exact=True).click()
    page.get_by_text("max 250 MB per bestand", exact=False).wait_for(timeout=5000)
    context.close()
    return {
        "viewport": name,
        "routes": checked,
        "newsletterHits": newsletter_hits,
        "horizontalOverflow": overflow,
        "brokenPublicMedia": broken_public_media,
        "consoleErrors": console_errors,
        "pageErrors": page_errors,
        "failedRequests": [item for item in failed_requests if "favicon" not in item],
    }


def main() -> int:
    chrome_candidates = [
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    ]
    executable = next((str(path) for path in chrome_candidates if path.exists()), None)
    if not executable:
        raise RuntimeError("Geen lokale Chrome- of Edge-installatie gevonden.")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=executable)
        results = [
            run_viewport(browser, "desktop", {"width": 1440, "height": 1000}),
            run_viewport(browser, "mobile", {"width": 390, "height": 844}),
        ]
        browser.close()
    print(json.dumps(results, ensure_ascii=False, indent=2))
    problems = sum(
        len(result[key])
        for result in results
        for key in ("newsletterHits", "horizontalOverflow", "brokenPublicMedia", "consoleErrors", "pageErrors", "failedRequests")
    )
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
