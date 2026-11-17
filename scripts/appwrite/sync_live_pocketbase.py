#!/usr/bin/env python3
"""Incrementally copy current PocketBase records and media into Appwrite.

Passwords remain sourced from the frozen SQLite snapshot, because PocketBase
correctly never exposes password hashes over its HTTP API. This script is safe
to rerun and deliberately does not delete Appwrite runtime records.
"""

from __future__ import annotations

import importlib.util
import json
import mimetypes
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = Path(__file__).with_name("migrate_pocketbase.py")
SPEC = importlib.util.spec_from_file_location("ow3d_migration", MODULE_PATH)
assert SPEC and SPEC.loader
migration = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = migration
SPEC.loader.exec_module(migration)


class PocketBase:
    def __init__(self, base: str, email: str, password: str):
        self.base = base.rstrip("/")
        payload = self.request("POST", "/api/collections/_superusers/auth-with-password", {"identity": email, "password": password}, authenticated=False)
        self.token = payload["token"]

    def request(self, method: str, path: str, body=None, *, authenticated: bool = True, raw: bool = False):
        headers = {}
        if authenticated:
            headers["Authorization"] = f"Bearer {self.token}"
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        with urllib.request.urlopen(urllib.request.Request(self.base + path, data=data, method=method, headers=headers), timeout=300) as response:
            content = response.read()
            return content if raw else (json.loads(content) if content else None)

    def records(self, collection: str):
        result = []
        page = 1
        while True:
            query = urllib.parse.urlencode({"page": page, "perPage": 500, "skipTotal": "false"})
            payload = self.request("GET", f"/api/collections/{urllib.parse.quote(collection)}/records?{query}")
            result.extend(payload.get("items", []))
            if page >= int(payload.get("totalPages") or 1):
                return result
            page += 1

    def file(self, collection_id: str, record_id: str, filename: str) -> bytes:
        path = "/api/files/{}/{}/{}".format(*(urllib.parse.quote(part, safe="") for part in (collection_id, record_id, filename)))
        return self.request("GET", path, raw=True)


def normalized(record):
    return {key: value for key, value in record.items() if key not in {"collectionId", "collectionName", "expand"}}


def multipart_bytes(fields, filename: str, content: bytes):
    boundary = "----ow3dlivesync"
    chunks = []
    for key, value in fields:
        chunks += [f"--{boundary}\r\n".encode(), f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode(), value.encode(), b"\r\n"]
    mime = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    chunks += [f"--{boundary}\r\n".encode(), f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode(), f"Content-Type: {mime}\r\n\r\n".encode(), content, b"\r\n", f"--{boundary}--\r\n".encode()]
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def main() -> int:
    config = migration.load_env(ROOT / ".env.appwrite.local")
    pocketbase = PocketBase(config["POCKETBASE_URL"], config["POCKETBASE_ADMIN_EMAIL"], config["POCKETBASE_ADMIN_PASSWORD"])
    appwrite = migration.Appwrite(
        config["APPWRITE_ENDPOINT"], config["APPWRITE_PROJECT_ID"], config["APPWRITE_API_KEY"],
        config.get("APPWRITE_DATABASE_ID", "overweel3d-v2"), int(config.get("APPWRITE_MAX_FILE_SIZE", "262144000")),
        config.get("APPWRITE_PUBLIC_BUCKET_ID", "public-media-v2"), config.get("APPWRITE_PRIVATE_BUCKET_ID", "private-files-v2"),
    )
    users = appwrite.list_all("/users", "users")
    user_ids = {str((user.get("prefs") or {}).get("legacy_user_id") or ""): user["$id"] for user in users}
    live = {}
    for name in sorted(migration.ALWAYS_INCLUDE):
        records = [normalized(item) for item in pocketbase.records(name)]
        live[name] = records
        migration.ensure_table(appwrite, name)
        existing = migration.list_existing_rows(appwrite, name)
        created = updated = 0
        for record in records:
            legacy_id = migration.source_legacy_id(record)
            previous = existing.get(legacy_id)
            if name == "storage_files" and previous:
                old_payload = previous.get("payload") or "{}"
                if isinstance(old_payload, str):
                    old_payload = json.loads(old_payload)
                for key in ("_appwrite_bucket_id", "_appwrite_file_id"):
                    if old_payload.get(key):
                        record[key] = old_payload[key]
            body = {"data": {"legacy_id": legacy_id, "payload": json.dumps(record, ensure_ascii=False, separators=(",", ":"), default=str)}, "permissions": migration.row_permissions(name, record, user_ids)}
            if previous:
                appwrite.request("PATCH", f"/tablesdb/{appwrite.database}/tables/{name}/rows/{previous['$id']}", body)
                updated += 1
            else:
                appwrite.request("PUT", f"/tablesdb/{appwrite.database}/tables/{name}/rows/{migration.stable_id('row_', f'{name}:{legacy_id}')}", body)
                created += 1
        print(f"[live-data] {name}: {len(records)} bron, {created} nieuw, {updated} bijgewerkt", flush=True)

    migration.ensure_bucket(appwrite, appwrite.public_bucket, True)
    migration.ensure_bucket(appwrite, appwrite.private_bucket, False)
    storage_rows = migration.list_existing_rows(appwrite, "storage_files")
    uploaded = skipped = 0
    for record in live.get("storage_files", []):
        filename = str(record.get("file") or "")
        if not filename:
            continue
        is_public = bool(record.get("public"))
        bucket_id = appwrite.public_bucket if is_public else appwrite.private_bucket
        file_id = migration.stable_id("file_", f"{record.get('bucket')}:{record.get('path')}")
        expected_size = int(record.get("size") or 0)
        content = None
        try:
            current = appwrite.request("GET", f"/storage/buckets/{bucket_id}/files/{file_id}")
            current_size = int(current.get("sizeOriginal") or -1)
            if expected_size <= 0 or current_size == expected_size:
                skipped += 1
            else:
                try:
                    content = pocketbase.file("storage_files", str(record["id"]), filename)
                except Exception:
                    # Custom filesystem-backed PocketBase records are not all
                    # exposed through /api/files. Keep the verified Appwrite
                    # copy instead of destructively replacing it.
                    skipped += 1
                else:
                    appwrite.request("DELETE", f"/storage/buckets/{bucket_id}/files/{file_id}")
                    permissions = ['read("label:admin")', 'update("label:admin")', 'delete("label:admin")']
                    if is_public:
                        permissions.append('read("any")')
                    body, content_type = multipart_bytes([("fileId", file_id)] + [("permissions[]", item) for item in permissions], filename, content)
                    appwrite.request("POST", f"/storage/buckets/{bucket_id}/files", raw=body, headers={"Content-Type": content_type})
                    uploaded += 1
        except migration.ApiError as error:
            if error.status != 404:
                raise
            try:
                content = pocketbase.file("storage_files", str(record["id"]), filename)
            except Exception as download_error:
                raise RuntimeError(f"PocketBase-bestand kon niet worden gelezen: {record.get('bucket')}/{record.get('path')} ({filename})") from download_error
            permissions = ['read("label:admin")', 'update("label:admin")', 'delete("label:admin")']
            if is_public:
                permissions.append('read("any")')
            body, content_type = multipart_bytes([("fileId", file_id)] + [("permissions[]", item) for item in permissions], filename, content)
            appwrite.request("POST", f"/storage/buckets/{bucket_id}/files", raw=body, headers={"Content-Type": content_type})
            uploaded += 1
        legacy_id = migration.source_legacy_id(record)
        row = storage_rows[legacy_id]
        enriched = {**record, "_appwrite_bucket_id": bucket_id, "_appwrite_file_id": file_id}
        appwrite.request("PATCH", f"/tablesdb/{appwrite.database}/tables/storage_files/rows/{row['$id']}", {"data": {"legacy_id": legacy_id, "payload": json.dumps(enriched, ensure_ascii=False, separators=(",", ":"), default=str)}, "permissions": row.get("$permissions") or migration.row_permissions("storage_files", record, user_ids)})
    print(json.dumps({"collections": len(live), "files_uploaded": uploaded, "files_unchanged": skipped}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
