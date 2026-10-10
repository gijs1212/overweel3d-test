import asyncio
import io
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
from PIL import Image

os.environ.setdefault("CONTROL_PASSWORD", "test-dashboard-password")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pocketbase import PocketBaseSocialClient


def test_png_is_uploaded_as_jpeg(monkeypatch):
    source = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(source, format="PNG")
    pb = PocketBaseSocialClient()
    requests = []
    def source_response(request):
        requests.append(request)
        return httpx.Response(200, content=source.getvalue())
    pb.client = httpx.AsyncClient(transport=httpx.MockTransport(source_response))
    pb.action = AsyncMock(return_value={"prepared": True, "url": "https://api.example.com/api/files/storage_files/id/photo.jpg"})

    from app.pairing import pairing_store
    pairing_store._state.update({"token": "test-token", "pocketbase_url": "https://api.example.com"})
    url = asyncio.run(pb.prepare_public_media("job-1", 0, "generated-color:#FF0000"))

    assert url == "https://api.example.com/api/files/storage_files/id/photo.jpg"
    assert requests[0].url.path == "/api/overweel3d/social/media"
    assert requests[0].url.params["path"] == "generated-color:#FF0000"
    assert requests[0].headers["X-Overweel-Social-Token"] == "test-token"
    action, payload = pb.action.await_args.args
    assert action == "prepare_media"
    assert payload["job_id"] == "job-1"
    assert payload["index"] == 0
    import base64
    jpeg = base64.b64decode(payload["image_base64"])
    assert jpeg.startswith(b"\xff\xd8") and jpeg.endswith(b"\xff\xd9")
    asyncio.run(pb.close())
