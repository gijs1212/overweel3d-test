#!/usr/bin/env python3
"""Exercise every RPC and server function used by the Overweel3D website.

The test creates one isolated order, uses validation paths for destructive
operations, and removes every record carrying the run marker in a finally
block.  Secrets are read from the local env file and never printed.
"""

from __future__ import annotations

import getpass
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / ".env.appwrite.local"
ENDPOINT = "https://appwrite.gijsoverweel.nl/v1"
PROJECT = "6af9acde00152998cadb"
DATABASE = "overweel3d-v2"
FUNCTION = "overweel3d-api"
ADMIN_EMAIL = "gijsoverweel@gmail.com"


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_FILE.exists():
        for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


ENV = load_env()
API_KEY = ENV.get("APPWRITE_API_KEY", "")
if not API_KEY:
    raise SystemExit("APPWRITE_API_KEY ontbreekt in .env.appwrite.local")


class Client:
    def __init__(self) -> None:
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def request(self, method: str, path: str, body=None, *, admin_key: bool = False):
        headers = {
            "X-Appwrite-Project": PROJECT,
            "X-Appwrite-Response-Format": "2.4.0",
            "Origin": "https://overweel3d.gijsoverweel.nl",
        }
        if admin_key:
            headers["X-Appwrite-Key"] = API_KEY
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(ENDPOINT + path, data=data, method=method, headers=headers)
        try:
            with self.opener.open(request, timeout=120) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                payload = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                payload = {"message": raw.decode("utf-8", "replace")}
            return exc.code, payload

    def login(self, password: str) -> None:
        status, payload = self.request(
            "POST", "/account/sessions/email", {"email": ADMIN_EMAIL, "password": password}
        )
        if status not in (200, 201):
            raise RuntimeError(f"Adminlogin mislukt (HTTP {status}): {payload}")
        status, account = self.request("GET", "/account")
        if status != 200 or "admin" not in (account or {}).get("labels", []):
            raise RuntimeError("Ingelogd account heeft geen adminlabel.")

    def execute(self, kind: str, name: str, body: dict, *, authenticated: bool = True):
        # A separate anonymous client proves that admin-only paths reject calls.
        target = self if authenticated else Client()
        status, execution = target.request(
            "POST",
            f"/functions/{FUNCTION}/executions",
            {
                "body": json.dumps({"kind": kind, "name": name, "body": body}),
                "async": False,
                "path": "/",
                "method": "POST",
                "headers": json.dumps({"content-type": "application/json"}),
            },
        )
        if status not in (200, 201) or not isinstance(execution, dict):
            raise RuntimeError(f"Uitvoering {name} kon niet starten: HTTP {status} {execution}")
        try:
            response = json.loads(execution.get("responseBody") or "{}")
        except json.JSONDecodeError:
            response = {"raw": execution.get("responseBody")}
        return int(execution.get("responseStatusCode") or 0), response, execution.get("status")

    def rows(self, table: str) -> list[dict]:
        result: list[dict] = []
        offset = 0
        while True:
            query = urllib.parse.quote(json.dumps({"method": "offset", "values": [offset]}))
            status, payload = self.request(
                "GET",
                f"/tablesdb/{DATABASE}/tables/{table}/rows?queries[]={query}",
                admin_key=True,
            )
            if status != 200:
                # Small test tables fit in the default page and older servers may
                # reject the query encoding.
                status, payload = self.request(
                    "GET", f"/tablesdb/{DATABASE}/tables/{table}/rows", admin_key=True
                )
            if status != 200:
                return result
            page = (payload or {}).get("rows", [])
            result.extend(page)
            if len(page) < 25:
                return result
            offset += len(page)

    def delete_row(self, table: str, row_id: str) -> bool:
        status, _ = self.request(
            "DELETE", f"/tablesdb/{DATABASE}/tables/{table}/rows/{row_id}", admin_key=True
        )
        return status in (200, 204)


def decoded(row: dict) -> dict:
    try:
        data = json.loads(row.get("payload") or "{}")
    except (TypeError, json.JSONDecodeError):
        data = {}
    data.setdefault("id", row.get("legacy_id") or row.get("$id"))
    data["_row_id"] = row.get("$id")
    return data


def main() -> int:
    # Imported lazily so the file remains executable on Python builds that do
    # not expose urllib.parse through the top-level package attribute.
    import urllib.parse  # noqa: PLC0415

    globals()["urllib"].parse = urllib.parse
    client = Client()
    password = os.environ.get("APPWRITE_TEST_PASSWORD") or getpass.getpass("Appwrite adminwachtwoord: ")
    client.login(password)

    marker = f"OW3D-FUNCTION-TEST-{int(time.time())}-{uuid.uuid4().hex[:8]}"
    results: list[dict] = []
    order_id = ""
    order_token = ""
    blog_id = ""
    cleanup_tables = [
        "print_runs", "print_jobs", "order_3mf_plate_mappings", "order_files",
        "delivery_appointments", "order_messages", "order_events", "orders",
        "blog_posts",
    ]

    def check(kind: str, name: str, body: dict, expected=(200,), authenticated=True, note=""):
        status, payload, execution_status = client.execute(kind, name, body, authenticated=authenticated)
        passed = status in set(expected) and execution_status == "completed"
        results.append({
            "name": name,
            "kind": kind,
            "status": status,
            "expected": list(expected),
            "passed": passed,
            "note": note,
            "error": (payload or {}).get("error") if isinstance(payload, dict) else None,
        })
        if not passed:
            raise AssertionError(f"{name}: HTTP {status}, verwacht {expected}: {payload}")
        return (payload or {}).get("data") if isinstance(payload, dict) else payload

    try:
        number = check("rpc", "generate_order_number", {})
        expected_order_id = str(uuid.uuid4())
        expected_order_token = uuid.uuid4().hex + uuid.uuid4().hex
        created = check("rpc", "create_guest_order", {"p_order": {
            "id": expected_order_id,
            "customer_order_token": expected_order_token,
            "order_number": number,
            "customer_name": marker,
            "customer_email": ADMIN_EMAIL,
            "shipping_address": "Teststraat 1",
            "billing_address": "",
            "postal_code": "3241GC",
            "city": "Middelharnis",
            "country": "Nederland",
            "notes": marker,
            "order_method": "function_integration_test",
            "quantity": 1,
            "total_plates": 1,
            "plate_runs_completed": [0],
            "plate_runs_required_per_plate": [2],
            "plate_print_statuses": [False],
        }})
        response_order = created[0] if isinstance(created, list) and created else {}
        if response_order.get("id") != expected_order_id or response_order.get("customer_order_token") != expected_order_token:
            raise AssertionError(f"create_guest_order antwoord mist id of klanttoken: {created}")
        order_token = response_order.get("customer_order_token", expected_order_token)
        order_id = response_order.get("id", expected_order_id)
        if not order_id or not order_token:
            # Appwrite 2.4 can return the Function response before the created
            # row's compatibility payload has been re-read. Resolve it by the
            # unique customer token instead of making the whole order flow
            # depend on the optional id field in the RPC response.
            matching = [decoded(row) for row in client.rows("orders")]
            stored_order = next((item for item in matching if item.get("customer_order_token") == order_token and order_token), None)
            if not stored_order:
                stored_order = next((item for item in matching if marker in json.dumps(item, ensure_ascii=False, default=str)), None)
            order_id = (stored_order or {}).get("id", "")
            order_token = order_token or (stored_order or {}).get("customer_order_token", "")
        if not order_id or not order_token:
            raise AssertionError(f"create_guest_order gaf geen herleidbaar order-id/token terug: {created}")

        # RPCs: real success where isolated, validation/authorization where the
        # production operation would alter unrelated data.
        check("rpc", "attach_order_file", {"order_id": order_id, "storage_path": f"test/{marker}.3mf", "original_filename": "test.3mf"}, (409,))
        check("rpc", "check_discount_code", {"code_text": marker})
        check("rpc", "check_gift_card", {"code_text": marker})
        check("rpc", "claim_order_to_account", {"p_token": order_token})
        check("rpc", "record_discount_redemption", {"code_text": marker, "order_id_value": order_id, "discount_amount_value": 1}, (404,))
        check("rpc", "redeem_gift_card", {"code_text": marker, "order_id_value": order_id, "requested_amount": 1}, (404,))
        check("rpc", "convert_loyalty_points", {"points_to_redeem": 0}, (400,))
        check("rpc", "refresh_order_plate_data", {"p_order_id": order_id})
        check("rpc", "record_manual_order_plate_run", {"p_order_id": order_id, "p_plate_number": 1})
        check("rpc", "decrement_manual_order_plate_run", {"p_order_id": order_id, "p_plate_number": 1})
        check("rpc", "approve_and_count_print_job_run", {"p_suggestion_job_id": "missing", "p_plate_number": 1})
        check("rpc", "save_order_3mf_plate_selection", {"p_order_id": order_id, "p_mappings": []}, (400,))
        check("rpc", "request_printer_ams_refresh", {"p_printer_id": "missing"}, (404,))
        check("rpc", "request_bambu_login_code", {"p_printer_id": "missing"}, (404,))
        check("rpc", "promote_inventory_to_filament_color", {"p_inventory_id": "missing"}, (404,))

        settings = check("rpc", "get_social_publisher_settings", {})
        check("rpc", "social_publisher_status", {})
        check("rpc", "social_publisher_next_post", {})
        check("rpc", "social_publisher_activity", {})
        check("rpc", "set_social_publisher_enabled", {"p_enabled": bool((settings or {}).get("enabled"))})
        check("rpc", "set_social_facebook_mode", {"p_job_id": "missing", "p_mode": "combined"}, (404,))
        check("rpc", "publish_social_job_now", {"p_job_id": "missing"}, (404,))
        check("rpc", "pair_social_publisher", {"p_control_url": "https://invalid.example", "p_pairing_code": "test", "p_integration_token": "test"}, (400,))
        check("rpc", "enqueue_social_backfill", {}, (403,), authenticated=False)
        check("rpc", "clear_social_publisher_queue", {}, (403,), authenticated=False)

        # Server functions, including live Resend calls to the admin mailbox.
        check("function", "send-account-welcome", {}, note="live Resend")
        check("function", "send-contact-message", {"name": marker, "email": ADMIN_EMAIL, "subject": "Appwrite functietest", "message": marker}, note="live Resend")
        check("function", "get-order-by-token", {"token": order_token})
        check("function", "get-order-by-token", {"token": order_token, "action": "send_message", "message": marker}, note="live Resend")
        check("function", "get-order-by-token", {"token": order_token, "action": "update_shipping_address", "addressData": {"shipping_address": "Teststraat 2", "postal_code": "3241GC", "city": "Middelharnis", "country": "Nederland"}})
        check("function", "get-order-by-token", {"token": order_token, "action": "propose_delivery", "appointmentData": {"date": "2099-01-01", "timeSlot": "Overdag", "notes": marker}})
        check("function", "update-order-status", {"token": order_token, "action": "accept"})
        check("function", "update-order-status", {"token": order_token, "action": "reject"})
        check("function", "send-order-email", {"orderId": order_id, "type": "test_email"}, note="live Resend")
        check("function", "send-chat-notification", {"orderId": order_id, "senderType": "admin", "message": marker}, note="live Resend")
        invoice = check("function", "generate-invoice", {"orderId": order_id, "description": marker})
        if marker not in (invoice or {}).get("html", ""):
            raise AssertionError("generate-invoice bevat de testomschrijving niet")
        check("function", "process-referral-reward", {"discount_code": marker, "order_id": order_id})
        check("function", "printer-pair", {"action": "invalid"}, (400,))
        check("function", "exchange-onedrive-token", {"code": "", "codeVerifier": ""}, (400,))
        content = check("function", "generate-content-marketing", {"platform": "Facebook", "contentType": "test", "topic": marker})
        if marker not in (content or {}).get("content", ""):
            raise AssertionError("generate-content-marketing mist het onderwerp")
        blog = check("function", "generate-blog-post", {"topic": marker})
        blog_id = (blog or {}).get("id", "")
        check("function", "complete-order", {"order_id": order_id}, note="live Resend")
    finally:
        removed = 0
        cleanup_errors: list[str] = []
        for table in cleanup_tables:
            for raw in client.rows(table):
                item = decoded(raw)
                belongs = (
                    item.get("id") in {order_id, blog_id}
                    or item.get("order_id") == order_id
                    or "OW3D-FUNCTION-TEST-" in json.dumps(item, ensure_ascii=False, default=str)
                )
                if belongs and raw.get("$id"):
                    if client.delete_row(table, raw["$id"]):
                        removed += 1
                    else:
                        cleanup_errors.append(f"{table}:{raw['$id']}")
        results.append({"name": "cleanup", "kind": "maintenance", "status": 200 if not cleanup_errors else 500, "expected": [200], "passed": not cleanup_errors, "note": f"{removed} testrecords verwijderd", "error": ", ".join(cleanup_errors) or None})
        try:
            client.request("DELETE", "/account/sessions/current")
        except Exception:
            pass

    failed = [item for item in results if not item["passed"]]
    report = {
        "marker": marker,
        "functionVersion": "1.5.1",
        "tested": len(results) - 1,
        "passed": len(results) - len(failed),
        "failed": len(failed),
        "results": results,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
