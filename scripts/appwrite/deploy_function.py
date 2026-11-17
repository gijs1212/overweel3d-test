#!/usr/bin/env python3
"""Deploy the Overweel3D compatibility API to self-hosted Appwrite."""

from __future__ import annotations

import argparse
import io
import json
import mimetypes
import tarfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV = ROOT / ".env.appwrite.local"
FUNCTION_DIR = ROOT / "appwrite" / "functions" / "overweel3d-api"


def load_env(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        result[key.strip()] = value.strip().strip('"').strip("'")
    return result


class Client:
    def __init__(self, endpoint: str, project: str, key: str):
        self.endpoint = endpoint.rstrip("/")
        self.project = project
        self.key = key

    def request(self, method: str, path: str, body: Any = None, *, raw: bytes | None = None, content_type: str | None = None):
        headers = {
            "X-Appwrite-Project": self.project,
            "X-Appwrite-Key": self.key,
            "X-Appwrite-Response-Format": "2.4.0",
        }
        data = raw
        if body is not None:
            data = json.dumps(body, separators=(",", ":")).encode()
            headers["Content-Type"] = "application/json"
        if content_type:
            headers["Content-Type"] = content_type
        request = urllib.request.Request(f"{self.endpoint}{path}", data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=1800) as response:
                payload = response.read()
                return json.loads(payload) if payload else None
        except urllib.error.HTTPError as error:
            payload = error.read().decode(errors="replace")
            raise RuntimeError(f"{method} {path} -> HTTP {error.code}: {payload}") from error


def archive() -> bytes:
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as tar:
        for path in sorted(FUNCTION_DIR.rglob("*")):
            if path.is_file() and "node_modules" not in path.parts:
                tar.add(path, arcname=path.relative_to(FUNCTION_DIR).as_posix())
    return output.getvalue()


def multipart(fields: list[tuple[str, str]], filename: str, content: bytes) -> tuple[bytes, str]:
    boundary = f"----ow3d{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields:
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            value.encode(), b"\r\n",
        ])
    chunks.extend([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="code"; filename="{filename}"\r\n'.encode(),
        f"Content-Type: {mimetypes.guess_type(filename)[0] or 'application/gzip'}\r\n\r\n".encode(),
        content, b"\r\n", f"--{boundary}--\r\n".encode(),
    ])
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--runtime", default="node-22")
    parser.add_argument("--function-id", default="overweel3d-api")
    parser.add_argument("--list-runtimes", action="store_true")
    args = parser.parse_args()
    config = load_env(args.env)
    client = Client(config["APPWRITE_ENDPOINT"], config["APPWRITE_PROJECT_ID"], config["APPWRITE_API_KEY"])
    if args.list_runtimes:
        payload = client.request("GET", "/functions/runtimes")
        print("\n".join(str(item.get("$id") or item.get("name")) for item in payload.get("runtimes", [])))
        return 0

    scopes = ["users.read", "users.write", "databases.read", "tables.read", "rows.read", "rows.write", "buckets.read", "files.read", "files.write"]
    settings = {
        "name": "Overweel3D API",
        "runtime": args.runtime,
        "execute": ["any"],
        "events": [],
        "schedule": "*/15 * * * *",
        "timeout": 120,
        "enabled": True,
        "logging": True,
        "entrypoint": "src/main.js",
        "commands": "npm install --omit=dev",
        "scopes": scopes,
    }
    try:
        client.request("GET", f"/functions/{args.function_id}")
        client.request("PUT", f"/functions/{args.function_id}", settings)
        print("Functie-instellingen bijgewerkt.")
    except RuntimeError as error:
        if "HTTP 404" not in str(error):
            raise
        client.request("POST", "/functions", {"functionId": args.function_id, **settings})
        print("Functie aangemaakt.")

    variables = {
        "APPWRITE_ENDPOINT": config["APPWRITE_ENDPOINT"],
        "APPWRITE_PROJECT_ID": config["APPWRITE_PROJECT_ID"],
        "APPWRITE_DATABASE_ID": "overweel3d-v2",
        "APPWRITE_PUBLIC_BUCKET_ID": "public-media-v2",
        "APPWRITE_PRIVATE_BUCKET_ID": "private-files-v2",
    }
    optional_variables = {
        "RESEND_API_KEY": True,
        "RESEND_FROM": False,
        "APPWRITE_FUNCTION_PUBLIC_URL": False,
        "ONEDRIVE_TENANT_ID": False,
        "ONEDRIVE_CLIENT_ID": True,
        "ONEDRIVE_CLIENT_SECRET": True,
        "ONEDRIVE_REFRESH_TOKEN": True,
        "ONEDRIVE_REDIRECT_URI": False,
    }
    variables.update({name: config[name] for name in optional_variables if config.get(name)})
    for name, value in variables.items():
        variable_id = name.lower().replace("_", "-")
        secret = optional_variables.get(name, False)
        try:
            client.request(
                "POST",
                f"/functions/{args.function_id}/variables",
                {"variableId": variable_id, "key": name, "value": value, "secret": secret},
            )
        except RuntimeError as error:
            if "already exists" not in str(error).lower() and "HTTP 409" not in str(error):
                raise
            client.request(
                "PUT",
                f"/functions/{args.function_id}/variables/{variable_id}",
                {"key": name, "value": value, "secret": secret},
            )

    body, content_type = multipart(
        [("entrypoint", "src/main.js"), ("commands", "npm install --omit=dev"), ("activate", "true")],
        "overweel3d-api.tar.gz",
        archive(),
    )
    deployment = client.request("POST", f"/functions/{args.function_id}/deployments", raw=body, content_type=content_type)
    deployment_id = deployment["$id"]
    print(f"Deployment {deployment_id} aangemaakt; wachten op build...")
    for _ in range(180):
        current = client.request("GET", f"/functions/{args.function_id}/deployments/{deployment_id}")
        status = current.get("status")
        if status == "ready":
            print("Deployment is actief en gereed.")
            return 0
        if status == "failed":
            raise RuntimeError(f"Function-build mislukt: {current.get('buildLogs') or current.get('status')}")
        time.sleep(2)
    raise TimeoutError("Function-build bleef langer dan zes minuten bezig.")


if __name__ == "__main__":
    raise SystemExit(main())
