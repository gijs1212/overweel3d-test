#!/usr/bin/env python3
"""Safe Appwrite Social Publisher smoke test; never publishes a post."""

from __future__ import annotations

import json
import urllib.request

from deploy_function import Client, DEFAULT_ENV, load_env


def execute(client: Client, name: str, body: dict) -> dict:
    request_body = {
        "body": json.dumps({"kind": "social", "name": name, "body": body}),
        "async": False,
        "path": "/",
        "method": "POST",
        "headers": json.dumps({"content-type": "application/json"}),
    }
    request = urllib.request.Request(
        f"{client.endpoint}/functions/overweel3d-api/executions",
        data=json.dumps(request_body).encode(),
        method="POST",
        headers={"Content-Type": "application/json", "X-Appwrite-Project": client.project},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        execution = json.loads(response.read())
    payload = json.loads(execution.get("responseBody") or "{}")
    assert execution.get("status") == "completed", execution
    assert execution.get("responseStatusCode") == 200, payload
    return payload["data"]


def main() -> int:
    config = load_env(DEFAULT_ENV)
    client = Client(config["APPWRITE_ENDPOINT"], config["APPWRITE_PROJECT_ID"], config["APPWRITE_API_KEY"])
    page = client.request("GET", "/tablesdb/overweel3d-v2/tables/social_publisher_settings/rows")
    rows = page.get("rows") or []
    assert rows, "Social Publisher-instellingen ontbreken."
    setting = json.loads(rows[0].get("payload") or "{}")
    token = setting.get("integration_token")
    assert token and len(token) >= 32, "Social Publisher-koppelsleutel ontbreekt."

    heartbeat = execute(client, "heartbeat", {"token": token, "version": "3.0.2"})
    assert heartbeat.get("connected") is True
    assert heartbeat.get("hook_version") == "1.19.21"
    assert heartbeat.get("backend") == "appwrite-1.5.1"

    # meta_ready=false deliberately prevents a queue item from being claimed
    # or published, while still validating queue/catalog access.
    poll = execute(client, "poll", {"token": token, "version": "3.0.2", "meta_ready": False})
    assert poll.get("job") is None
    print(json.dumps({"heartbeat": "connected", "hook": heartbeat["hook_version"], "safe_poll": "ok"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
