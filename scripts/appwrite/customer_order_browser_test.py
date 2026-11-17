#!/usr/bin/env python3
"""Creates and removes one real Appwrite customer/order through the browser UI."""

from __future__ import annotations

import json
import secrets
import sys
import time
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from deploy_function import Client, DEFAULT_ENV, load_env  # noqa: E402


BASE_URL = "http://127.0.0.1:5175"


def chrome_executable() -> str:
    paths = [Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"), Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")]
    return str(next(path for path in paths if path.exists()))


def table_rows(client: Client, table: str) -> list[dict]:
    response = client.request("GET", f"/tablesdb/overweel3d-v2/tables/{table}/rows?queries[]={quote(json.dumps({'method':'limit','values':[100]}))}")
    return response.get("rows") or []


def cleanup(client: Client, email: str, account_id: str | None) -> dict:
    removed = {"orders": 0, "profiles": 0, "users": 0}
    for table in ("orders", "profiles"):
        for row in table_rows(client, table):
            payload = json.loads(row.get("payload") or "{}")
            if str(payload.get("customer_email") or payload.get("email") or "").lower() == email.lower():
                client.request("DELETE", f"/tablesdb/overweel3d-v2/tables/{table}/rows/{row['$id']}")
                removed[table] += 1
    if account_id:
        client.request("DELETE", f"/users/{account_id}")
        removed["users"] = 1
    return removed


def main() -> int:
    marker = f"OW3D-E2E-{int(time.time())}"
    email = f"gijsoverweel+{marker.lower()}@gmail.com"
    password = f"Test!{secrets.token_hex(8)}Aa1"
    config = load_env(DEFAULT_ENV)
    client = Client(config["APPWRITE_ENDPOINT"], config["APPWRITE_PROJECT_ID"], config["APPWRITE_API_KEY"])
    account_id = None
    order_number = None
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, executable_path=chrome_executable())
            context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="nl-NL")
            page = context.new_page()
            diagnostics: list[str] = []
            page.on("pageerror", lambda exc: diagnostics.append(f"pageerror: {exc}"))
            page.on("response", lambda response: diagnostics.append(f"HTTP {response.status} {response.url}") if response.status >= 400 else None)
            page.goto(BASE_URL + "/register", wait_until="networkidle")
            page.evaluate("localStorage.setItem('overweel3d:social-follow-prompt:2026-11-v1','seen'); document.cookie='cookieConsent=necessary; path=/'")
            page.reload(wait_until="networkidle")
            page.get_by_label("Volledige naam").fill(marker)
            page.get_by_label("E-mailadres").fill(email)
            page.get_by_label("Wachtwoord", exact=True).fill(password)
            page.get_by_label("Bevestig wachtwoord").fill(password)
            page.get_by_role("button", name="Registreren", exact=True).click()
            try:
                page.wait_for_url("**/dashboard", timeout=30_000)
            except Exception as exc:
                raise AssertionError(f"Registratie bleef op {page.url}: {page.locator('body').inner_text()[-2000:]} | {diagnostics}") from exc
            account = page.evaluate("""async () => (await (await fetch('https://appwrite.gijsoverweel.nl/v1/account', {headers:{'X-Appwrite-Project':'6af9acde00152998cadb','X-Fallback-Cookies':localStorage.getItem('cookieFallback')||''}})).json())""")
            account_id = account["$id"]

            page.goto(BASE_URL + "/bestellen", wait_until="networkidle")
            page.get_by_placeholder("https://...").fill("https://example.com/overweel3d-e2e-test.stl")
            page.get_by_role("combobox").nth(0).click()
            page.get_by_role("option", name="PLA", exact=True).click()
            page.get_by_role("combobox").nth(1).click()
            page.get_by_role("option", name="Zwart", exact=True).click()
            page.get_by_role("button", name="Toevoegen aan winkelmandje", exact=True).click()
            page.get_by_role("button", name="Verder naar gegevens", exact=True).click()
            page.locator('label:has-text("Verzendadres") + input').fill("Teststraat 1")
            page.locator('label:has-text("Postcode") + input').fill("3241GC")
            page.locator('label:has-text("Stad") + input').fill("Middelharnis")
            page.locator('label:has-text("Opmerkingen") + textarea').fill(marker)
            page.get_by_role("checkbox").click()
            page.get_by_role("button", name="Bestelling plaatsen", exact=True).click()
            page.wait_for_url("**/order/**", timeout=45_000)
            page.wait_for_load_state("networkidle")
            body = page.locator("body").inner_text()
            if "NaN" in body or "Er ging iets mis" in body or "Something went wrong" in body:
                raise AssertionError(body[-1500:])
            orders = [json.loads(row.get("payload") or "{}") for row in table_rows(client, "orders")]
            created = next(order for order in orders if str(order.get("customer_email", "")).lower() == email.lower())
            order_number = created.get("order_number")
            context.close()
            browser.close()
        print(json.dumps({"registered": email, "accountId": account_id, "orderNumber": order_number, "status": "passed"}, indent=2))
        return 0
    finally:
        print(json.dumps({"cleanup": cleanup(client, email, account_id)}, indent=2))


if __name__ == "__main__":
    raise SystemExit(main())
