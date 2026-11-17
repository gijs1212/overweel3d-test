#!/usr/bin/env python3
"""Repeatable PocketBase -> Appwrite migration for Overweel3D.

The script reads a frozen PocketBase backup, never the changing live database.
Every Appwrite resource uses a stable ID and every operation is safe to rerun.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV = ROOT / ".env.appwrite.local"
DEFAULT_SNAPSHOT = (
    ROOT
    / "private-backups"
    / "pocketbase-pre-appwrite-2026-11-12"
    / "snapshot"
)

PUBLIC_READ = {
    "app_settings",
    "blog_posts",
    "categories",
    "filament_colors",
    "materials",
    "portfolio_project_media",
    "portfolio_projects",
    "product_categories",
    "product_color_availability",
    "product_images",
    "product_options",
    "product_reviews",
    "product_variants",
    "products",
}

GUEST_CREATE = {
    "newsletter_subscribers",
    "newsletter_subscriptions",
    "order_files",
    "order_messages",
    "orders",
    "product_reviews",
    "saved_carts",
}

PRIVATE_OWNER_TABLES = {
    "delivery_appointments",
    "discount_redemptions",
    "gift_card_redemptions",
    "loyalty_transactions",
    "order_3mf_plate_mappings",
    "order_events",
    "order_files",
    "order_messages",
    "orders",
    "print_jobs",
    "print_runs",
    "saved_carts",
}

ALWAYS_INCLUDE = {
    "app_settings",
    "blog_posts",
    "categories",
    "delivery_appointments",
    "discount_codes",
    "discount_redemptions",
    "email_campaigns",
    "exported_orders",
    "filament_colors",
    "filament_inventory",
    "gift_card_redemptions",
    "gift_cards",
    "loyalty_transactions",
    "materials",
    "newsletter_subscribers",
    "newsletter_subscriptions",
    "onedrive_tokens",
    "order_3mf_plate_mappings",
    "order_events",
    "order_files",
    "order_messages",
    "orders",
    "portfolio_project_media",
    "portfolio_projects",
    "print_jobs",
    "print_runs",
    "printer_ams_slots",
    "printer_pairing_codes",
    "printer_queue_items",
    "printer_sd_files",
    "printers",
    "product_categories",
    "product_color_availability",
    "product_images",
    "product_options",
    "product_reviews",
    "product_variants",
    "products",
    "saved_carts",
    "social_media_grants",
    "social_post_history",
    "social_post_jobs",
    "social_publisher_sessions",
    "social_publisher_settings",
    "storage_files",
}

SYNTHETIC_USER_TABLES = ("profiles", "user_roles")

# These tables are deliberately changed by the live Appwrite workers after the
# initial import. Their presence is still verified, but byte-for-byte snapshot
# equality would incorrectly report a failed migration after the first
# heartbeat or settings update.
MUTABLE_RUNTIME_COLLECTIONS = {
    "social_post_jobs",
    "social_post_history",
    "social_publisher_sessions",
    "social_publisher_settings",
}


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if path.exists():
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    for key, value in os.environ.items():
        if value:
            values[key] = value
    return values


def stable_id(prefix: str, value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return f"{prefix}{digest}"[:36]


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def parse_json(value: Any, fallback: Any = None) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return value if fallback is None else fallback


class ApiError(RuntimeError):
    def __init__(self, method: str, path: str, status: int, payload: Any):
        super().__init__(f"{method} {path} -> HTTP {status}: {payload}")
        self.method = method
        self.path = path
        self.status = status
        self.payload = payload


class Appwrite:
    def __init__(
        self,
        endpoint: str,
        project: str,
        key: str,
        database: str,
        maximum_file_size: int = 30_000_000,
        public_bucket: str = "public-media",
        private_bucket: str = "private-files",
    ):
        self.endpoint = endpoint.rstrip("/")
        self.project = project
        self.key = key
        self.database = database
        self.maximum_file_size = maximum_file_size
        self.public_bucket = public_bucket
        self.private_bucket = private_bucket

    def request(
        self,
        method: str,
        path: str,
        body: Any | None = None,
        *,
        headers: dict[str, str] | None = None,
        raw: bytes | None = None,
    ) -> Any:
        url = f"{self.endpoint}{path}"
        request_headers = {
            "X-Appwrite-Project": self.project,
            "X-Appwrite-Key": self.key,
            "X-Appwrite-Response-Format": "2.4.0",
        }
        if headers:
            request_headers.update(headers)
        data = raw
        if body is not None:
            data = json_bytes(body)
            request_headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, method=method, headers=request_headers)
        try:
            with urllib.request.urlopen(req, timeout=1800) as response:
                content = response.read()
                if not content:
                    return None
                content_type = response.headers.get("Content-Type", "")
                return json.loads(content) if "json" in content_type else content
        except urllib.error.HTTPError as error:
            payload_raw = error.read()
            try:
                payload = json.loads(payload_raw)
            except (TypeError, ValueError):
                payload = payload_raw.decode("utf-8", errors="replace")
            raise ApiError(method, path, error.code, payload) from error

    def list_all(self, path: str, key: str) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            queries = [
                ("queries[]", json.dumps({"method": "limit", "values": [100]})),
                ("queries[]", json.dumps({"method": "offset", "values": [offset]})),
            ]
            separator = "&" if "?" in path else "?"
            payload = self.request("GET", f"{path}{separator}{urllib.parse.urlencode(queries)}")
            batch = list(payload.get(key, []))
            rows.extend(batch)
            if len(batch) < 100:
                return rows
            offset += len(batch)

    def wait_column(self, table: str, column: str) -> None:
        path = f"/tablesdb/{self.database}/tables/{table}/columns/{column}"
        for _ in range(120):
            item = self.request("GET", path)
            status = item.get("status")
            if status == "available":
                return
            if status == "failed":
                raise RuntimeError(f"Appwrite-kolom {table}.{column} faalde: {item.get('error')}")
            time.sleep(0.5)
        raise TimeoutError(f"Appwrite-kolom {table}.{column} bleef te lang in verwerking")


@dataclass
class Collection:
    id: str
    name: str
    type: str
    fields: list[dict[str, Any]]


class PocketSnapshot:
    def __init__(self, directory: Path):
        self.directory = directory
        self.database_path = directory / "data.db"
        self.storage = directory / "storage"
        if not self.database_path.exists():
            raise FileNotFoundError(f"PocketBase data.db ontbreekt in {directory}")
        self.db = sqlite3.connect(f"file:{self.database_path}?mode=ro", uri=True)
        self.db.row_factory = sqlite3.Row
        self.tables = {
            row[0]
            for row in self.db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
        }
        self.collections = self._collections()

    def _collections(self) -> dict[str, Collection]:
        result: dict[str, Collection] = {}
        if "_collections" not in self.tables:
            return result
        for raw in self.db.execute("SELECT * FROM _collections"):
            row = dict(raw)
            name = str(row.get("name") or "")
            fields = parse_json(row.get("fields") or row.get("schema") or "[]", [])
            result[name] = Collection(
                id=str(row.get("id") or ""),
                name=name,
                type=str(row.get("type") or "base"),
                fields=fields if isinstance(fields, list) else [],
            )
        return result

    def relevant_collections(self) -> list[Collection]:
        selected: list[Collection] = []
        for name, collection in self.collections.items():
            if name.startswith("_") or name == "users":
                continue
            field_names = {str(field.get("name")) for field in collection.fields}
            if name in ALWAYS_INCLUDE or "supabase_id" in field_names:
                if name in self.tables:
                    selected.append(collection)
        return sorted(selected, key=lambda item: item.name)

    def columns(self, table: str) -> list[tuple[str, str]]:
        return [(str(row[1]), str(row[2]).upper()) for row in self.db.execute(f'PRAGMA table_info("{table}")')]

    def records(self, table: str) -> list[dict[str, Any]]:
        types = dict(self.columns(table))
        records: list[dict[str, Any]] = []
        for raw in self.db.execute(f'SELECT * FROM "{table}"'):
            value = dict(raw)
            for key, column_type in types.items():
                if value.get(key) is None:
                    continue
                if column_type == "JSON":
                    value[key] = parse_json(value[key])
                elif column_type == "BOOLEAN":
                    value[key] = bool(value[key])
            records.append(value)
        return records

    def users(self) -> list[dict[str, Any]]:
        return self.records("users")

    def source_file(self, collection: Collection, record: dict[str, Any], filename: str) -> Path:
        return self.storage / collection.id / str(record["id"]) / filename


def table_permissions(name: str) -> list[str]:
    permissions = [
        'read("label:admin")',
        'create("label:admin")',
        'update("label:admin")',
        'delete("label:admin")',
    ]
    if name in PUBLIC_READ:
        permissions.append('read("any")')
    if name in GUEST_CREATE:
        permissions.append('create("any")')
    return permissions


def user_target_id(row: dict[str, Any]) -> str:
    preferred = str(row.get("supabase_id") or row.get("id") or "")
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,35}", preferred):
        return preferred
    return stable_id("usr_", preferred)


def owner_legacy_id(table: str, record: dict[str, Any]) -> str:
    for key in ("user_id", "owner_user_id", "created_by"):
        value = record.get(key)
        if value:
            return str(value)
    if table == "orders":
        return str(record.get("user_id") or "")
    return ""


def row_permissions(
    table: str,
    record: dict[str, Any],
    user_ids: dict[str, str],
) -> list[str]:
    permissions = [
        'read("label:admin")',
        'update("label:admin")',
        'delete("label:admin")',
    ]
    if table in PUBLIC_READ:
        permissions.append('read("any")')
    legacy_owner = owner_legacy_id(table, record)
    owner = user_ids.get(legacy_owner)
    if owner:
        permissions.extend(
            [
                f'read("user:{owner}")',
                f'update("user:{owner}")',
                f'delete("user:{owner}")',
            ]
        )
    return list(dict.fromkeys(permissions))


def ensure_database(appwrite: Appwrite) -> None:
    try:
        appwrite.request("GET", f"/tablesdb/{appwrite.database}")
        return
    except ApiError as error:
        if error.status != 404:
            raise
    appwrite.request(
        "POST",
        "/tablesdb",
        {
            "databaseId": appwrite.database,
            "name": "Overweel3D",
            "enabled": True,
        },
    )


def ensure_table(appwrite: Appwrite, name: str) -> None:
    table_path = f"/tablesdb/{appwrite.database}/tables/{name}"
    try:
        table = appwrite.request("GET", table_path)
        appwrite.request(
            "PUT",
            table_path,
            {
                "name": name,
                "permissions": table_permissions(name),
                "rowSecurity": True,
                "enabled": True,
            },
        )
    except ApiError as error:
        if error.status != 404:
            raise
        appwrite.request(
            "POST",
            f"/tablesdb/{appwrite.database}/tables",
            {
                "tableId": name,
                "name": name,
                "permissions": table_permissions(name),
                "rowSecurity": True,
                "enabled": True,
            },
        )
        table = {"columns": []}

    column_keys = {str(column.get("key")) for column in table.get("columns", [])}
    if "legacy_id" not in column_keys:
        appwrite.request(
            "POST",
            f"{table_path}/columns/varchar",
            {
                "key": "legacy_id",
                "size": 128,
                "required": True,
                "array": False,
                "encrypt": False,
            },
        )
        appwrite.wait_column(name, "legacy_id")
    if "payload" not in column_keys:
        appwrite.request(
            "POST",
            f"{table_path}/columns/longtext",
            {"key": "payload", "required": True, "array": False, "encrypt": False},
        )
        appwrite.wait_column(name, "payload")

    indexes = appwrite.request("GET", f"{table_path}/indexes").get("indexes", [])
    if not any(index.get("key") == "legacy_id_unique" for index in indexes):
        appwrite.request(
            "POST",
            f"{table_path}/indexes",
            {
                "key": "legacy_id_unique",
                "type": "unique",
                "columns": ["legacy_id"],
                "orders": ["ASC"],
            },
        )


def list_existing_rows(appwrite: Appwrite, table: str) -> dict[str, dict[str, Any]]:
    path = f"/tablesdb/{appwrite.database}/tables/{table}/rows"
    return {
        str(row.get("legacy_id")): row
        for row in appwrite.list_all(path, "rows")
        if row.get("legacy_id")
    }


def import_users(appwrite: Appwrite, snapshot: PocketSnapshot) -> tuple[dict[str, str], dict[str, int]]:
    existing = appwrite.list_all("/users", "users")
    by_id = {str(user.get("$id")): user for user in existing}
    by_email = {str(user.get("email", "")).lower(): user for user in existing if user.get("email")}
    mapping: dict[str, str] = {}
    stats = {
        "created": 0,
        "recreated": 0,
        "updated": 0,
        "source": 0,
        "password_match": 0,
        "password_mismatch": 0,
        "password_unavailable": 0,
    }

    for row in snapshot.users():
        email = str(row.get("email") or "").strip().lower()
        if not email:
            continue
        stats["source"] += 1
        desired_id = user_target_id(row)
        existing_user = by_id.get(desired_id) or by_email.get(email)
        target_id = str(existing_user.get("$id")) if existing_user else desired_id
        was_recreated = False
        full_name = " ".join(
            part for part in [str(row.get("first_name") or "").strip(), str(row.get("last_name") or "").strip()] if part
        ) or str(row.get("name") or "").strip() or email
        password_hash = str(row.get("password") or "")
        if not password_hash.startswith("$2"):
            raise RuntimeError(f"Gebruiker {email} heeft geen ondersteunde bcrypt-hash")
        if existing_user:
            current_hash = str(existing_user.get("password") or "")
            imported_marker = bool((existing_user.get("prefs") or {}).get("pocketbase_password_imported"))
            if imported_marker:
                # Appwrite may transparently rehash the same password after a
                # successful login. Never recreate a marked account merely
                # because its bcrypt salt/hash changed.
                stats["password_match"] += 1
            elif current_hash:
                same_password = existing_user.get("hash") == "bcrypt" and secrets.compare_digest(
                    current_hash, password_hash
                )
                if same_password:
                    stats["password_match"] += 1
                else:
                    stats["password_mismatch"] += 1
                    # The target project is not live yet. Recreating only the
                    # mismatching target account guarantees the PocketBase
                    # password remains valid without touching the source.
                    appwrite.request("DELETE", f"/users/{target_id}")
                    by_id.pop(target_id, None)
                    by_email.pop(email, None)
                    target_id = desired_id
                    existing_user = None
                    was_recreated = True
                    stats["recreated"] += 1
            else:
                stats["password_unavailable"] += 1
        if not existing_user:
            created = appwrite.request(
                "POST",
                "/users/bcrypt",
                {
                    "userId": target_id,
                    "email": email,
                    "password": password_hash,
                    "name": full_name[:128],
                },
            )
            existing_user = created
            by_id[target_id] = created
            by_email[email] = created
            if not was_recreated:
                stats["created"] += 1
        else:
            appwrite.request("PATCH", f"/users/{target_id}/name", {"name": full_name[:128]})
            stats["updated"] += 1

        role = str(row.get("role") or "customer")
        labels = ["admin"] if role == "admin" else ["customer"]
        appwrite.request("PUT", f"/users/{target_id}/labels", {"labels": labels})
        appwrite.request(
            "PATCH",
            f"/users/{target_id}/prefs",
            {
                "prefs": {
                    "pocketbase_id": row.get("id"),
                    "legacy_user_id": row.get("supabase_id") or row.get("id"),
                    "first_name": row.get("first_name") or "",
                    "last_name": row.get("last_name") or "",
                    "phone": row.get("phone") or "",
                    "address": row.get("address") or "",
                    "postal_code": row.get("postal_code") or "",
                    "city": row.get("city") or "",
                    "country": row.get("country") or "",
                    "newsletter_subscribed": bool(row.get("newsletter_subscribed")),
                    "role": role,
                    "legacy_data": row.get("legacy_data"),
                    "pocketbase_password_imported": True,
                    "pocketbase_password_fingerprint": hashlib.sha256(password_hash.encode()).hexdigest(),
                }
            },
        )
        if bool(row.get("verified")) != bool(existing_user.get("emailVerification")):
            appwrite.request(
                "PATCH",
                f"/users/{target_id}/verification",
                {"emailVerification": bool(row.get("verified"))},
            )
        legacy_values = {str(row.get("id") or ""), str(row.get("supabase_id") or "")}
        for legacy in legacy_values:
            if legacy:
                mapping[legacy] = target_id
    return mapping, stats


def synthetic_user_records(snapshot: PocketSnapshot) -> dict[str, list[dict[str, Any]]]:
    profiles: list[dict[str, Any]] = []
    roles: list[dict[str, Any]] = []
    for row in snapshot.users():
        legacy_id = str(row.get("supabase_id") or row.get("id") or "")
        if not legacy_id:
            continue
        legacy_data = row.get("legacy_data") if isinstance(row.get("legacy_data"), dict) else {}
        legacy_profile = legacy_data.get("profile") if isinstance(legacy_data.get("profile"), dict) else {}
        profiles.append(
            {
                "id": legacy_id,
                "user_id": legacy_id,
                "full_name": " ".join(
                    part
                    for part in [str(row.get("first_name") or "").strip(), str(row.get("last_name") or "").strip()]
                    if part
                ),
                "email": row.get("email") or "",
                "phone": row.get("phone") or "",
                "company_name": legacy_profile.get("company_name") or "",
                "billing_address": legacy_profile.get("billing_address") or "",
                "shipping_address": row.get("address") or legacy_profile.get("shipping_address") or "",
                "postal_code": row.get("postal_code") or "",
                "city": row.get("city") or "",
                "country": row.get("country") or "",
                "vat_number": legacy_profile.get("vat_number") or "",
                "newsletter_subscribed": bool(row.get("newsletter_subscribed")),
                "account_welcome_email_sent_at": legacy_profile.get("account_welcome_email_sent_at"),
                "loyalty_points": int(legacy_profile.get("loyalty_points") or 0),
                "created_at": row.get("created"),
                "updated_at": row.get("updated"),
            }
        )
        roles.append({"id": f"role:{legacy_id}", "user_id": legacy_id, "role": row.get("role") or "customer"})
    return {"profiles": profiles, "user_roles": roles}


def import_synthetic_user_tables(
    appwrite: Appwrite,
    snapshot: PocketSnapshot,
    user_ids: dict[str, str],
) -> dict[str, dict[str, int]]:
    report: dict[str, dict[str, int]] = {}
    for table, records in synthetic_user_records(snapshot).items():
        ensure_table(appwrite, table)
        existing = list_existing_rows(appwrite, table)
        stats = {"source": len(records), "created": 0, "updated": 0}
        for record in records:
            legacy_id = str(record["id"])
            owner = user_ids.get(legacy_id)
            permissions = ['read("label:admin")', 'update("label:admin")', 'delete("label:admin")']
            if owner:
                permissions.extend([f'read("user:{owner}")', f'update("user:{owner}")'])
            body = {
                "data": {
                    "legacy_id": legacy_id,
                    "payload": json.dumps(record, ensure_ascii=False, separators=(",", ":"), default=str),
                },
                "permissions": permissions,
            }
            previous = existing.get(legacy_id)
            if previous:
                appwrite.request(
                    "PATCH",
                    f"/tablesdb/{appwrite.database}/tables/{table}/rows/{previous['$id']}",
                    body,
                )
                stats["updated"] += 1
            else:
                appwrite.request(
                    "PUT",
                    f"/tablesdb/{appwrite.database}/tables/{table}/rows/{stable_id('row_', f'{table}:{legacy_id}')}",
                    body,
                )
                stats["created"] += 1
        report[table] = stats
        print(f"[data] {table}: {stats['source']} bron, {stats['created']} nieuw, {stats['updated']} bijgewerkt", flush=True)
    return report


def audit_user_passwords(appwrite: Appwrite, snapshot: PocketSnapshot) -> dict[str, int]:
    """Compare source and target hashes without changing either system."""
    existing = appwrite.list_all("/users", "users")
    by_id = {str(user.get("$id")): user for user in existing}
    by_email = {str(user.get("email", "")).lower(): user for user in existing if user.get("email")}
    stats = {"source": 0, "match": 0, "mismatch": 0, "missing": 0, "unavailable": 0}
    for row in snapshot.users():
        email = str(row.get("email") or "").strip().lower()
        if not email:
            continue
        stats["source"] += 1
        desired_id = user_target_id(row)
        target = by_id.get(desired_id) or by_email.get(email)
        if not target:
            stats["missing"] += 1
            continue
        target_hash = str(target.get("password") or "")
        prefs = target.get("prefs") or {}
        if prefs.get("pocketbase_password_imported") and prefs.get("pocketbase_password_fingerprint") == hashlib.sha256(str(row.get("password") or "").encode()).hexdigest():
            stats["match"] += 1
            continue
        if not target_hash:
            stats["unavailable"] += 1
            continue
        source_hash = str(row.get("password") or "")
        if target.get("hash") == "bcrypt" and secrets.compare_digest(target_hash, source_hash):
            stats["match"] += 1
        else:
            stats["mismatch"] += 1
    return stats


def import_records(
    appwrite: Appwrite,
    snapshot: PocketSnapshot,
    user_ids: dict[str, str],
) -> dict[str, dict[str, int]]:
    report: dict[str, dict[str, int]] = {}
    for collection in snapshot.relevant_collections():
        ensure_table(appwrite, collection.name)
        existing = list_existing_rows(appwrite, collection.name)
        stats = {"source": 0, "created": 0, "updated": 0}
        for record in snapshot.records(collection.name):
            stats["source"] += 1
            legacy_id = str(record.get("supabase_id") or record.get("id") or "")
            if not legacy_id:
                legacy_id = stable_id("src_", json.dumps(record, sort_keys=True, default=str))
            body = {
                "data": {
                    "legacy_id": legacy_id,
                    "payload": json.dumps(record, ensure_ascii=False, separators=(",", ":"), default=str),
                },
                "permissions": row_permissions(collection.name, record, user_ids),
            }
            previous = existing.get(legacy_id)
            if previous:
                row_id = str(previous["$id"])
                appwrite.request(
                    "PATCH",
                    f"/tablesdb/{appwrite.database}/tables/{collection.name}/rows/{row_id}",
                    body,
                )
                stats["updated"] += 1
            else:
                row_id = stable_id("row_", f"{collection.name}:{legacy_id}")
                appwrite.request(
                    "PUT",
                    f"/tablesdb/{appwrite.database}/tables/{collection.name}/rows/{row_id}",
                    body,
                )
                stats["created"] += 1
        report[collection.name] = stats
        print(
            f"[data] {collection.name}: {stats['source']} bron, "
            f"{stats['created']} nieuw, {stats['updated']} bijgewerkt",
            flush=True,
        )
    return report


def source_legacy_id(record: dict[str, Any]) -> str:
    legacy_id = str(record.get("supabase_id") or record.get("id") or "")
    if legacy_id:
        return legacy_id
    return stable_id("src_", json.dumps(record, sort_keys=True, default=str))


def reconcile_records(appwrite: Appwrite, snapshot: PocketSnapshot) -> dict[str, dict[str, int]]:
    """Delete only target rows that are not part of the frozen source snapshot.

    Earlier migration experiments used PocketBase record ids where a Supabase
    legacy id was available. Those rows are aliases of the same source record
    and must not survive next to the canonical row. The source snapshot remains
    read-only; this operation only reconciles the new, not-yet-live Appwrite
    project.
    """
    report: dict[str, dict[str, int]] = {}
    for collection in snapshot.relevant_collections():
        source_ids = {source_legacy_id(record) for record in snapshot.records(collection.name)}
        rows = appwrite.list_all(
            f"/tablesdb/{appwrite.database}/tables/{collection.name}/rows",
            "rows",
        )
        deleted = 0
        for row in rows:
            if str(row.get("legacy_id") or "") in source_ids:
                continue
            appwrite.request(
                "DELETE",
                f"/tablesdb/{appwrite.database}/tables/{collection.name}/rows/{row['$id']}",
            )
            deleted += 1
        report[collection.name] = {
            "source": len(source_ids),
            "target_before": len(rows),
            "deleted": deleted,
            "target_after": len(rows) - deleted,
        }
        if deleted:
            print(f"[reconcile] {collection.name}: {deleted} verouderde rij(en) verwijderd", flush=True)
    return report


def ensure_bucket(appwrite: Appwrite, bucket_id: str, public: bool) -> None:
    permissions = [
        'read("label:admin")',
        'create("label:admin")',
        'update("label:admin")',
        'delete("label:admin")',
    ]
    if public:
        permissions.append('read("any")')
    settings = {
        "name": "Overweel3D openbare media" if public else "Overweel3D privébestanden",
        "permissions": permissions,
        "fileSecurity": True,
        "enabled": True,
        "maximumFileSize": appwrite.maximum_file_size,
        "allowedFileExtensions": [],
        "compression": "none",
        "encryption": True,
        "antivirus": True,
    }
    try:
        appwrite.request("GET", f"/storage/buckets/{bucket_id}")
        appwrite.request("PUT", f"/storage/buckets/{bucket_id}", settings)
        return
    except ApiError as error:
        if error.status != 404:
            raise
    appwrite.request(
        "POST",
        "/storage/buckets",
        {
            "bucketId": bucket_id,
            **settings,
        },
    )


def multipart(fields: Iterable[tuple[str, str]], file_path: Path) -> tuple[bytes, str]:
    boundary = f"----ow3d{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for key, value in fields:
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode(),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )
    mime = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    chunks.extend(
        [
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'.encode(),
            f"Content-Type: {mime}\r\n\r\n".encode(),
            file_path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def import_files(appwrite: Appwrite, snapshot: PocketSnapshot) -> dict[str, int]:
    ensure_bucket(appwrite, appwrite.public_bucket, True)
    ensure_bucket(appwrite, appwrite.private_bucket, False)
    collection = snapshot.collections.get("storage_files")
    if not collection or "storage_files" not in snapshot.tables:
        return {"source": 0, "uploaded": 0, "skipped": 0, "missing": 0}

    existing_rows = list_existing_rows(appwrite, "storage_files")
    stats = {"source": 0, "uploaded": 0, "skipped": 0, "missing": 0}
    for record in snapshot.records("storage_files"):
        stats["source"] += 1
        filename = str(record.get("file") or "")
        source = snapshot.source_file(collection, record, filename)
        if not filename or not source.exists():
            stats["missing"] += 1
            print(f"[bestand] ontbreekt: {record.get('bucket')}/{record.get('path')} -> {source}", flush=True)
            continue
        is_public = bool(record.get("public"))
        bucket_id = appwrite.public_bucket if is_public else appwrite.private_bucket
        logical = f"{record.get('bucket')}:{record.get('path')}"
        file_id = stable_id("file_", logical)
        should_upload = True
        try:
            current = appwrite.request("GET", f"/storage/buckets/{bucket_id}/files/{file_id}")
            if int(current.get("sizeOriginal") or -1) == source.stat().st_size:
                should_upload = False
                stats["skipped"] += 1
            else:
                appwrite.request("DELETE", f"/storage/buckets/{bucket_id}/files/{file_id}")
        except ApiError as error:
            if error.status != 404:
                raise
        if should_upload:
            permissions = [
                'read("label:admin")',
                'update("label:admin")',
                'delete("label:admin")',
            ]
            if is_public:
                permissions.append('read("any")')
            fields = [("fileId", file_id)] + [("permissions[]", item) for item in permissions]
            body, content_type = multipart(fields, source)
            appwrite.request(
                "POST",
                f"/storage/buckets/{bucket_id}/files",
                raw=body,
                headers={"Content-Type": content_type},
            )
            stats["uploaded"] += 1
        legacy_id = str(record.get("supabase_id") or record.get("id") or "")
        row = existing_rows.get(legacy_id)
        if row:
            enriched = dict(record)
            enriched["_appwrite_bucket_id"] = bucket_id
            enriched["_appwrite_file_id"] = file_id
            appwrite.request(
                "PATCH",
                f"/tablesdb/{appwrite.database}/tables/storage_files/rows/{row['$id']}",
                {
                    "data": {
                        "legacy_id": legacy_id,
                        "payload": json.dumps(enriched, ensure_ascii=False, separators=(",", ":"), default=str),
                    },
                    "permissions": row.get("$permissions") or row_permissions("storage_files", record, {}),
                },
            )
        print(
            f"[bestand] {'overgeslagen' if not should_upload else 'geüpload'}: "
            f"{record.get('bucket')}/{record.get('path')}",
            flush=True,
        )
    return stats


def verify(
    appwrite: Appwrite,
    snapshot: PocketSnapshot,
    user_stats: dict[str, int] | None = None,
    file_stats: dict[str, int] | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "ok": True,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "collections": {},
        "users": user_stats or {},
        "files": file_stats or {},
        "errors": [],
        "warnings": [],
    }
    for collection in snapshot.relevant_collections():
        source_records = snapshot.records(collection.name)
        source_count = len(source_records)
        try:
            target_rows = appwrite.list_all(
                f"/tablesdb/{appwrite.database}/tables/{collection.name}/rows",
                "rows",
            )
            target_count = len(target_rows)
        except ApiError as error:
            result["ok"] = False
            result["errors"].append(str(error))
            target_rows = []
            target_count = -1
        source_by_id = {source_legacy_id(record): record for record in source_records}
        target_by_id = {
            str(row.get("legacy_id") or ""): row
            for row in target_rows
            if row.get("legacy_id")
        }
        missing_ids = sorted(set(source_by_id) - set(target_by_id))
        extra_ids = sorted(set(target_by_id) - set(source_by_id))
        payload_mismatches: list[str] = []
        for legacy_id in sorted(set(source_by_id) & set(target_by_id)):
            target_payload = parse_json(target_by_id[legacy_id].get("payload"), {})
            if collection.name == "storage_files" and isinstance(target_payload, dict):
                target_payload = {
                    key: value
                    for key, value in target_payload.items()
                    if not key.startswith("_appwrite_")
                }
            if target_payload != source_by_id[legacy_id]:
                payload_mismatches.append(legacy_id)
        source_snapshot_match = not missing_ids and not extra_ids and not payload_mismatches
        runtime_mutable = collection.name in MUTABLE_RUNTIME_COLLECTIONS
        runtime_match = (
            target_count >= (1 if collection.name == "social_publisher_settings" else 0)
            if runtime_mutable
            else source_snapshot_match
        )
        result["collections"][collection.name] = {
            "source": source_count,
            "target": target_count,
            "missing": len(missing_ids),
            "extra": len(extra_ids),
            "payload_mismatches": len(payload_mismatches),
            "match": runtime_match,
            "source_snapshot_match": source_snapshot_match,
            "runtime_mutable": runtime_mutable,
        }
        if missing_ids or extra_ids or payload_mismatches:
            target = result["warnings"] if runtime_mutable and runtime_match else result["errors"]
            target.append(
                f"Inhoud wijkt af voor {collection.name}: bron={source_count}, doel={target_count}, "
                f"ontbreekt={len(missing_ids)}, extra={len(extra_ids)}, "
                f"payload={len(payload_mismatches)}"
            )
            if not runtime_match:
                result["ok"] = False

    for table, source_records in synthetic_user_records(snapshot).items():
        target_rows = appwrite.list_all(
            f"/tablesdb/{appwrite.database}/tables/{table}/rows",
            "rows",
        )
        source_by_id = {str(record["id"]): record for record in source_records}
        target_by_id = {
            str(row.get("legacy_id") or ""): parse_json(row.get("payload"), {})
            for row in target_rows
            if row.get("legacy_id")
        }
        missing_ids = set(source_by_id) - set(target_by_id)
        extra_ids = set(target_by_id) - set(source_by_id)
        payload_mismatches = [
            legacy_id
            for legacy_id in set(source_by_id) & set(target_by_id)
            if source_by_id[legacy_id] != target_by_id[legacy_id]
        ]
        matches = not missing_ids and not extra_ids and not payload_mismatches
        result["collections"][table] = {
            "source": len(source_records),
            "target": len(target_rows),
            "missing": len(missing_ids),
            "extra": len(extra_ids),
            "payload_mismatches": len(payload_mismatches),
            "match": matches,
        }
        if not matches:
            result["ok"] = False
            result["errors"].append(
                f"Inhoud wijkt af voor {table}: bron={len(source_records)}, doel={len(target_rows)}, "
                f"ontbreekt={len(missing_ids)}, extra={len(extra_ids)}, payload={len(payload_mismatches)}"
            )

    source_files: dict[tuple[str, str], int] = {}
    storage_collection = snapshot.collections.get("storage_files")
    if storage_collection and "storage_files" in snapshot.tables:
        for record in snapshot.records("storage_files"):
            filename = str(record.get("file") or "")
            source = snapshot.source_file(storage_collection, record, filename)
            if not filename or not source.exists():
                continue
            bucket_id = appwrite.public_bucket if bool(record.get("public")) else appwrite.private_bucket
            logical = f"{record.get('bucket')}:{record.get('path')}"
            source_files[(bucket_id, stable_id("file_", logical))] = source.stat().st_size
    target_files: dict[tuple[str, str], int] = {}
    for bucket_id in (appwrite.public_bucket, appwrite.private_bucket):
        try:
            for item in appwrite.list_all(f"/storage/buckets/{bucket_id}/files", "files"):
                target_files[(bucket_id, str(item.get("$id") or ""))] = int(
                    item.get("sizeOriginal") or -1
                )
        except ApiError as error:
            result["ok"] = False
            result["errors"].append(str(error))
    missing_files = sorted(set(source_files) - set(target_files))
    extra_files = sorted(set(target_files) - set(source_files))
    wrong_sizes = sorted(
        key for key in set(source_files) & set(target_files) if source_files[key] != target_files[key]
    )
    result["files"] = {
        **(file_stats or {}),
        "source": len(source_files),
        "target": len(target_files),
        "missing": len(missing_files),
        "extra": len(extra_files),
        "size_mismatches": len(wrong_sizes),
        "match": not missing_files and not extra_files and not wrong_sizes,
    }
    if missing_files or extra_files or wrong_sizes:
        result["ok"] = False
        result["errors"].append(
            f"Bestanden wijken af: ontbreekt={len(missing_files)}, extra={len(extra_files)}, "
            f"grootte={len(wrong_sizes)}"
        )
    report_path = snapshot.directory.parent / "appwrite-migration-report.json"
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def snapshot_manifest(snapshot: PocketSnapshot) -> dict[str, Any]:
    collections = []
    for collection in snapshot.relevant_collections():
        collections.append(
            {
                "id": collection.id,
                "name": collection.name,
                "type": collection.type,
                "records": len(snapshot.records(collection.name)),
            }
        )
    manifest = {
        "version": 1,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "database_sha256": hashlib.sha256(snapshot.database_path.read_bytes()).hexdigest(),
        "users": len(snapshot.users()),
        "collections": collections,
    }
    path = snapshot.directory.parent / "migration-manifest.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        choices=[
            "inspect",
            "provision",
            "users",
            "audit-users",
            "data",
            "reconcile",
            "files",
            "verify",
            "all",
        ],
    )
    parser.add_argument("--env", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--snapshot", type=Path, default=DEFAULT_SNAPSHOT)
    parser.add_argument(
        "--database",
        help="Overschrijf APPWRITE_DATABASE_ID, bijvoorbeeld voor een schone parallelle migratie.",
    )
    parser.add_argument("--public-bucket", default="public-media")
    parser.add_argument("--private-bucket", default="private-files")
    args = parser.parse_args()

    config = load_env(args.env)
    required = ["APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_API_KEY", "APPWRITE_DATABASE_ID"]
    missing = [key for key in required if not config.get(key)]
    if missing:
        raise RuntimeError(f"Ontbrekende migratieconfiguratie: {', '.join(missing)}")

    snapshot = PocketSnapshot(args.snapshot.resolve())
    appwrite = Appwrite(
        config["APPWRITE_ENDPOINT"],
        config["APPWRITE_PROJECT_ID"],
        config["APPWRITE_API_KEY"],
        args.database or config["APPWRITE_DATABASE_ID"],
        int(config.get("APPWRITE_MAX_FILE_SIZE", "30000000")),
        args.public_bucket,
        args.private_bucket,
    )
    manifest = snapshot_manifest(snapshot)
    print(
        f"Momentopname: {manifest['users']} gebruikers, "
        f"{len(manifest['collections'])} Overweel3D-collecties",
        flush=True,
    )
    if args.command == "inspect":
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 0

    if args.command == "audit-users":
        audit = audit_user_passwords(appwrite, snapshot)
        print(json.dumps(audit, ensure_ascii=False, indent=2))
        return 0 if audit["match"] == audit["source"] else 2

    ensure_database(appwrite)
    if args.command in {"provision", "all"}:
        for collection in snapshot.relevant_collections():
            ensure_table(appwrite, collection.name)
            print(f"[schema] {collection.name} gereed", flush=True)
        for table in SYNTHETIC_USER_TABLES:
            ensure_table(appwrite, table)
            print(f"[schema] {table} gereed", flush=True)
        if args.command == "provision":
            return 0

    user_mapping: dict[str, str] = {}
    user_stats: dict[str, int] = {}
    if args.command in {"users", "data", "files", "verify", "all"}:
        user_mapping, user_stats = import_users(appwrite, snapshot)
        print(f"[gebruikers] {user_stats}", flush=True)
        if args.command == "users":
            return 0

    if args.command in {"data", "all"}:
        data_stats = import_records(appwrite, snapshot, user_mapping)
        data_stats.update(import_synthetic_user_tables(appwrite, snapshot, user_mapping))
        (snapshot.directory.parent / "appwrite-data-import.json").write_text(
            json.dumps(data_stats, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        if args.command == "data":
            return 0

    if args.command in {"reconcile", "all"}:
        reconcile_stats = reconcile_records(appwrite, snapshot)
        (snapshot.directory.parent / "appwrite-reconcile.json").write_text(
            json.dumps(reconcile_stats, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        if args.command == "reconcile":
            return 0

    file_stats: dict[str, int] = {}
    if args.command in {"files", "all"}:
        # Files depend on storage_files rows from the data pass.
        ensure_table(appwrite, "storage_files")
        if not list_existing_rows(appwrite, "storage_files"):
            import_records(appwrite, snapshot, user_mapping)
        file_stats = import_files(appwrite, snapshot)
        print(f"[bestanden] {file_stats}", flush=True)
        if args.command == "files":
            return 0

    result = verify(appwrite, snapshot, user_stats, file_stats)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Migratie afgebroken; opnieuw uitvoeren is veilig.", file=sys.stderr)
        raise SystemExit(130)
