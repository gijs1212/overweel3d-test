import asyncio
import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

os.environ.setdefault("CONTROL_PASSWORD", "test-dashboard-password")
os.environ.setdefault("DATA_DIR", tempfile.mkdtemp(prefix="overweel-social-test-"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.meta_api import MetaResult
from app.worker import SocialWorker


def test_facebook_and_instagram_are_reported_separately():
    worker = SocialWorker()
    worker.hook_ready = True
    job = {
        "id": "job-1", "source_type": "product", "platforms": ["facebook", "instagram"],
        "texts": {"facebook": "FB", "instagram": "IG"},
        "media_urls": ["https://api.example.com/photo.jpg"], "dry_run": False,
    }
    action = AsyncMock(side_effect=[{"job": job}, {}, {}, {}, {}])
    worker.pb = SimpleNamespace(paired=True, action=action)
    worker.meta.publish = AsyncMock(side_effect=[MetaResult("published", "https://facebook.com/post"), MetaResult("published", "https://instagram.com/post")])

    asyncio.run(worker.tick())

    assert worker.meta.publish.await_count == 2
    reports = [call.args[1] for call in action.await_args_list if call.args[0] == "report"]
    assert [report["platform"] for report in reports] == ["facebook", "instagram"]
    assert [report["post_url"] for report in reports] == ["https://facebook.com/post", "https://instagram.com/post"]
