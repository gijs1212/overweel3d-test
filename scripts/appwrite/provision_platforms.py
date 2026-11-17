#!/usr/bin/env python3
"""Register the Overweel3D browser origins in the Appwrite project."""

import argparse
import getpass
import http.cookiejar
import json
import urllib.error
import urllib.request
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def env():
    values = {}
    for raw in (ROOT / ".env.appwrite.local").read_text(encoding="utf-8").splitlines():
        if raw.strip() and not raw.lstrip().startswith("#") and "=" in raw:
            key, value = raw.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def call(config, method, path, body=None):
    headers = {
        "X-Appwrite-Project": config["APPWRITE_PROJECT_ID"],
        "X-Appwrite-Key": config["APPWRITE_API_KEY"],
        "X-Appwrite-Response-Format": "2.4.0",
    }
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(config["APPWRITE_ENDPOINT"].rstrip("/") + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read()
            return json.loads(payload) if payload else None
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{method} {path} -> HTTP {error.code}: {error.read().decode(errors='replace')}") from error


parser = argparse.ArgumentParser()
parser.add_argument("--console-email")
args = parser.parse_args()
config = env()
project = config["APPWRITE_PROJECT_ID"]
console_opener = None


def console_call(method, path, body=None):
    headers = {"X-Appwrite-Project": "console", "X-Appwrite-Response-Format": "2.4.0"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(config["APPWRITE_ENDPOINT"].rstrip("/") + path, data=data, method=method, headers=headers)
    try:
        with console_opener.open(request, timeout=60) as response:
            payload = response.read()
            return json.loads(payload) if payload else None
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{method} {path} -> HTTP {error.code}: {error.read().decode(errors='replace')}") from error


try:
    platforms = call(config, "GET", f"/projects/{project}/platforms").get("platforms", [])
    platform_call = lambda method, path, body=None: call(config, method, path, body)
except RuntimeError as error:
    if "platforms.read" not in str(error) or not args.console_email:
        raise
    console_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    console_call("POST", "/account/sessions/email", {"email": args.console_email, "password": getpass.getpass("Appwrite-consolewachtwoord: ")})
    platforms = console_call("GET", f"/projects/{project}/platforms").get("platforms", [])
    platform_call = console_call
existing = {(item.get("type"), item.get("hostname")) for item in platforms}
targets = [
    ("Overweel3D productie", "overweel3d.gijsoverweel.nl"),
    ("Overweel3D lokaal", "localhost"),
]
for name, hostname in targets:
    if ("web", hostname) in existing:
        print(f"Platform bestaat al: {hostname}")
        continue
    platform_call("POST", f"/projects/{project}/platforms", {
        "platformId": uuid.uuid4().hex[:32], "type": "web", "name": name, "hostname": hostname,
    })
    print(f"Platform toegevoegd: {hostname}")
