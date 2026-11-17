#!/usr/bin/env python3
"""Verify a migrated Appwrite password without storing it."""

import argparse
import getpass
import http.cookiejar
import json
import urllib.request


parser = argparse.ArgumentParser()
parser.add_argument("--email", required=True)
args = parser.parse_args()
endpoint = "https://appwrite.gijsoverweel.nl/v1"
project = "6af9acde00152998cadb"
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(method, path, body=None):
    headers = {
        "X-Appwrite-Project": project,
        "X-Appwrite-Response-Format": "2.4.0",
        "Origin": "https://overweel3d.gijsoverweel.nl",
    }
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    with opener.open(urllib.request.Request(endpoint + path, data=data, method=method, headers=headers), timeout=60) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


call("POST", "/account/sessions/email", {"email": args.email, "password": getpass.getpass("Gemigreerd accountwachtwoord: ")})
account = call("GET", "/account")
assert account.get("email", "").lower() == args.email.lower()
assert "admin" in account.get("labels", []), account.get("labels")
call("DELETE", "/account/sessions/current")
print(json.dumps({"login": "ok", "role": "admin", "session_removed": True}))
