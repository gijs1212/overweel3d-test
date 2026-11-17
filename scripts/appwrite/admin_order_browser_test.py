#!/usr/bin/env python3
"""Creates and removes a real admin order through the Appwrite frontend."""

from __future__ import annotations

import getpass
import json
import sys
import time
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from deploy_function import Client, DEFAULT_ENV, load_env  # noqa: E402

BASE_URL = "http://127.0.0.1:5175"


def rows(client: Client, table: str) -> list[dict]:
    query = quote(json.dumps({"method": "limit", "values": [100]}))
    return client.request("GET", f"/tablesdb/overweel3d-v2/tables/{table}/rows?queries[]={query}").get("rows") or []


def chrome() -> str:
    for path in (Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"), Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")):
        if path.exists(): return str(path)
    raise RuntimeError("Chrome of Edge ontbreekt.")


def main() -> int:
    password = getpass.getpass("Appwrite adminwachtwoord: ")
    marker = f"OW3D-ADMIN-E2E-{int(time.time())}"
    config = load_env(DEFAULT_ENV)
    client = Client(config["APPWRITE_ENDPOINT"], config["APPWRITE_PROJECT_ID"], config["APPWRITE_API_KEY"])
    order_id = None
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, executable_path=chrome())
            page = browser.new_page(viewport={"width": 1280, "height": 900}, locale="nl-NL")
            page.goto(BASE_URL + "/login", wait_until="networkidle")
            page.evaluate("localStorage.setItem('overweel3d:social-follow-prompt:2026-11-v1','seen'); document.cookie='cookieConsent=necessary; path=/'")
            page.get_by_label("E-mailadres").fill("gijsoverweel@gmail.com")
            page.get_by_label("Wachtwoord", exact=True).fill(password)
            page.get_by_role("main").get_by_role("button", name="Inloggen", exact=True).click()
            page.wait_for_url("**/admin", timeout=20_000)
            page.goto(BASE_URL + "/admin/new-order", wait_until="networkidle")
            page.get_by_placeholder("Voor- en achternaam").fill("Gijs Overweel")
            page.get_by_placeholder("klant@email.nl").fill("gijsoverweel@gmail.com")
            page.get_by_role("combobox").nth(0).click()
            page.get_by_role("option", name="PLA", exact=True).click()
            page.get_by_role("combobox").nth(1).click()
            page.get_by_role("option", name="Zwart", exact=True).click()
            page.get_by_placeholder("0.00").fill("12.34")
            page.get_by_placeholder("Alleen zichtbaar voor admin.").fill(marker)
            page.get_by_role("button", name="Bestelling aanmaken", exact=True).click()
            page.wait_for_url("**/admin/order/**", timeout=30_000)
            candidates = []
            for row in rows(client, "orders"):
                payload = json.loads(row.get("payload") or "{}")
                if marker in str(payload.get("internal_notes") or ""):
                    candidates.append((row, payload))
            if len(candidates) != 1: raise AssertionError(f"Adminbestelling niet eenduidig gevonden: {len(candidates)}")
            row, payload = candidates[0]
            order_id = payload["id"]
            print(json.dumps({"status": "passed", "orderNumber": payload.get("order_number"), "orderId": order_id}, indent=2))
            browser.close()
        return 0
    finally:
        removed = 0
        if order_id:
            for table in ("order_events", "order_messages", "order_files", "print_jobs", "orders"):
                for row in rows(client, table):
                    payload = json.loads(row.get("payload") or "{}")
                    if payload.get("id") == order_id or payload.get("order_id") == order_id:
                        client.request("DELETE", f"/tablesdb/overweel3d-v2/tables/{table}/rows/{row['$id']}")
                        removed += 1
        print(json.dumps({"cleanupRecords": removed}))


if __name__ == "__main__":
    raise SystemExit(main())
