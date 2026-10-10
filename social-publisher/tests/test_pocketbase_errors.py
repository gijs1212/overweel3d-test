import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("CONTROL_PASSWORD", "test-dashboard-password")
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="overweel-social-test-"))

from app.pairing import pairing_store
from app.pocketbase import PocketBaseActionError, PocketBaseSocialClient


class PocketBaseErrorTests(unittest.TestCase):
    def test_action_error_keeps_server_message_and_action_name(self):
        pairing_store._state.update({
            "token": "test-token-not-written-to-the-error",
            "pocketbase_url": "https://api.example.test",
        })
        client = PocketBaseSocialClient()
        client.client = httpx.AsyncClient(transport=httpx.MockTransport(
            lambda _request: httpx.Response(400, json={
                "message": "Failed to create record.",
                "data": {"media_index": {"message": "This field is required."}},
            })
        ))

        with self.assertRaises(PocketBaseActionError) as raised:
            asyncio.run(client.action("poll", {"version": "2.6.0"}))

        message = str(raised.exception)
        self.assertIn("'poll'", message)
        self.assertIn("400", message)
        self.assertIn("media_index", message)
        self.assertNotIn("test-token", message)
        asyncio.run(client.close())


if __name__ == "__main__":
    unittest.main()
