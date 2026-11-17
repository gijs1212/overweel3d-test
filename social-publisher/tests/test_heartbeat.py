import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("CONTROL_PASSWORD", "test-dashboard-password")
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="overweel-social-test-"))

from app.worker import SocialWorker


class HeartbeatTests(unittest.TestCase):
    def test_heartbeat_marks_connection_only_after_pocketbase_confirms(self):
        worker = SocialWorker()
        action = AsyncMock(return_value={"connected": True, "hook_version": "1.19.1"})
        worker.pb = SimpleNamespace(paired=True, action=action)

        self.assertTrue(asyncio.run(worker.heartbeat()))
        self.assertTrue(worker.is_connected)
        self.assertTrue(worker.last_heartbeat_at)
        action.assert_awaited_once_with("heartbeat", {"version": "3.1.0"})

    def test_failed_heartbeat_clears_connection_and_exposes_error(self):
        worker = SocialWorker()
        action = AsyncMock(side_effect=RuntimeError("PocketBase niet bereikbaar"))
        worker.pb = SimpleNamespace(paired=True, action=action)
        worker.connected = True

        self.assertFalse(asyncio.run(worker.heartbeat()))
        self.assertFalse(worker.is_connected)
        self.assertIn("PocketBase niet bereikbaar", worker.last_connection_error)

    def test_unconfirmed_heartbeat_does_not_show_as_connected(self):
        worker = SocialWorker()
        worker.pb = SimpleNamespace(paired=True, action=AsyncMock(return_value={"connected": False}))

        self.assertFalse(asyncio.run(worker.heartbeat()))
        self.assertFalse(worker.is_connected)
        self.assertIn("niet bevestigd", worker.last_connection_error)


if __name__ == "__main__":
    unittest.main()
