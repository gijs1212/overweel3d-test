#!/usr/bin/env python3
"""Non-mutating smoke tests for public Overweel3D Appwrite endpoints."""

import json
import urllib.request


ENDPOINT = "https://appwrite.gijsoverweel.nl/v1"
PROJECT = "6af9acde00152998cadb"


def request(method: str, path: str, body=None):
    headers = {"X-Appwrite-Project": PROJECT, "X-Appwrite-Response-Format": "2.4.0"}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    with urllib.request.urlopen(urllib.request.Request(ENDPOINT + path, data=data, method=method, headers=headers), timeout=60) as response:
        return response.status, json.loads(response.read())


status, products = request("GET", "/tablesdb/overweel3d-v2/tables/products/rows")
assert status == 200 and products["total"] == 6, products

status, execution = request(
    "POST",
    "/functions/overweel3d-api/executions",
    {
        "body": json.dumps({"kind": "rpc", "name": "generate_order_number", "body": {}}),
        "async": False,
        "path": "/",
        "method": "POST",
        "headers": json.dumps({"content-type": "application/json"}),
    },
)
assert status in (200, 201), execution
assert execution.get("status") == "completed", execution
payload = json.loads(execution.get("responseBody") or "{}")
assert execution.get("responseStatusCode") == 200 and str(payload.get("data", "")).startswith("OW3D-"), execution

# The bridge endpoint must be reachable through Appwrite while refusing an
# invalid credential before it can mutate printer data.
status, bridge_execution = request(
    "POST",
    "/functions/overweel3d-api/executions",
    {
        "body": json.dumps({"kind": "bridge", "name": "status", "body": {"printer_id": "invalid", "bridge_token": "invalid", "payload": {"status": "idle"}}}),
        "async": False,
        "path": "/",
        "method": "POST",
        "headers": json.dumps({"content-type": "application/json"}),
    },
)
assert status in (200, 201), bridge_execution
assert bridge_execution.get("status") == "completed", bridge_execution
assert bridge_execution.get("responseStatusCode") == 403, bridge_execution

print(json.dumps({"catalog": products["total"], "function": execution["status"], "order_number_shape": "OW3D-#####", "bridge_auth": "rejects-invalid-token"}))
