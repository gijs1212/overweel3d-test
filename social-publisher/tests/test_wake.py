import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("CONTROL_PASSWORD", "test-dashboard-password")
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="overweel-social-wake-test-"))

from app.main import app, pairing_store, worker


def test_wake_requires_the_paired_internal_token():
    client = TestClient(app)
    previous = dict(pairing_store._state)
    try:
        pairing_store._state["token"] = "test-publisher-token"
        with patch.object(worker, "request_immediate_poll") as wake:
            assert client.post("/api/wake").status_code == 403
            assert client.post("/api/wake", headers={"X-Overweel-Social-Token": "wrong"}).status_code == 403
            response = client.post("/api/wake", headers={"X-Overweel-Social-Token": "test-publisher-token"})
            assert response.status_code == 200
            assert response.json() == {"ok": True}
            wake.assert_called_once_with()
    finally:
        pairing_store._state = previous
