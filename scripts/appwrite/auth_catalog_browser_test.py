#!/usr/bin/env python3
"""Browser test for Appwrite login persistence and public filament colors."""

from __future__ import annotations

import json
import os
import getpass
from pathlib import Path
from playwright.sync_api import sync_playwright


BASE_URL = "http://127.0.0.1:5175"
EMAIL = os.environ.get("OW3D_TEST_EMAIL", "gijsoverweel@gmail.com")


def chrome_executable() -> str:
    candidates = [
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    ]
    return str(next(path for path in candidates if path.exists()))


def main() -> int:
    password = os.environ.get("OW3D_TEST_PASSWORD") or getpass.getpass("Appwrite testwachtwoord: ")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=chrome_executable())
        context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="nl-NL")
        page = context.new_page()
        errors: list[str] = []
        authenticated = False
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.on("response", lambda response: errors.append(f"HTTP {response.status} {response.url}") if authenticated and response.status >= 400 else None)

        page.goto(BASE_URL + "/login", wait_until="networkidle")
        page.get_by_label("E-mailadres").fill(EMAIL)
        page.get_by_label("Wachtwoord", exact=True).fill(password)
        page.get_by_role("main").get_by_role("button", name="Inloggen", exact=True).click()
        page.wait_for_url(lambda url: str(url).endswith(("/admin", "/dashboard")), timeout=15_000)
        authenticated = True
        first_url = page.url
        fallback_saved = bool(page.evaluate("localStorage.getItem('cookieFallback')"))

        page.reload(wait_until="networkidle")
        body_after_reload = page.locator("body").inner_text()
        if "Log in voor uw dashboard" in body_after_reload:
            raise AssertionError("Sessie ging verloren na herladen.")

        page.goto(BASE_URL + "/bestellen", wait_until="networkidle")
        color_result = page.evaluate("""async () => {
          const endpoint = 'https://appwrite.gijsoverweel.nl/v1';
          const response = await fetch(endpoint + '/tablesdb/overweel3d-v2/tables/filament_colors/rows', {
            headers: {'X-Appwrite-Project':'6af9acde00152998cadb','X-Appwrite-Response-Format':'2.4.0'}
          });
          const payload = await response.json();
          return {status: response.status, total: payload.total, rows: (payload.rows || []).map(row => JSON.parse(row.payload))};
        }""")
        active_pla = [row["name"] for row in color_result["rows"] if row.get("active") and str(row.get("material", "")).lower() == "pla"]
        if len(active_pla) < 2:
            raise AssertionError(f"Onvoldoende PLA-kleuren beschikbaar: {active_pla}")
        adapter_colors = page.evaluate("""async () => {
          const module = await import('/src/integrations/supabase/client.ts');
          const result = await module.supabase.from('filament_colors').select('*').eq('active', true).order('material').order('sort_order');
          return {count: result.data?.length || 0, names: (result.data || []).map(row => row.name), error: result.error?.message || null};
        }""")
        material_select, color_select = page.get_by_role("combobox").nth(0), page.get_by_role("combobox").nth(1)
        material_select.click()
        page.get_by_role("option", name="PLA", exact=True).click()
        color_select.click()
        visible_color_options = page.get_by_role("option").all_inner_texts()
        page.keyboard.press("Escape")
        if len(visible_color_options) < 3 or visible_color_options == ["Multicolor (meerdere kleuren)"]:
            raise AssertionError(f"Kleurkeuze toont de catalogus niet: {visible_color_options}; adapter={adapter_colors}")

        result = {
            "loginRedirect": first_url,
            "fallbackSessionStored": fallback_saved,
            "sessionSurvivedReload": True,
            "publicColorStatus": color_result["status"],
            "publicColorCount": color_result["total"],
            "activePlaColors": active_pla,
            "adapterColors": adapter_colors,
            "visiblePlaColorOptions": visible_color_options,
            "browserErrors": errors,
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        context.close()
        browser.close()
        return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
