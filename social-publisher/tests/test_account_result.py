import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("CONTROL_PASSWORD", "test-dashboard-password")
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="overweel-social-test-"))

from app.worker import SocialWorker


class AccountResultTests(unittest.TestCase):
    def test_both_api_platforms_are_reported_in_one_request(self):
        worker = SocialWorker()
        worker.hook_ready = True
        action = AsyncMock(side_effect=[{"job": {"id": "check-1", "source_type": "session_check"}}, {}])
        worker.pb = SimpleNamespace(paired=True, action=action)
        with patch.object(worker.meta, "check_accounts", new_callable=AsyncMock) as check:
            check.return_value = {"facebook": {"name": "Overweel3D", "url": "https://www.facebook.com/Overweel3D"}, "instagram": {"name": "overweel3d", "url": "https://www.instagram.com/overweel3d/"}}
            asyncio.run(worker.tick())

        self.assertEqual(action.await_count, 2)
        report = action.await_args_list[1]
        self.assertEqual(report.args[0], "session_check_result")
        self.assertEqual(report.args[1]["job_id"], "check-1")
        self.assertEqual(report.args[1]["results"]["facebook"]["status"], "connected")
        self.assertEqual(report.args[1]["results"]["instagram"]["status"], "connected")


if __name__ == "__main__":
    unittest.main()
