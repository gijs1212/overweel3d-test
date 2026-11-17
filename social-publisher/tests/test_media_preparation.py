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

from app.pocketbase import PocketBaseActionError, PocketBaseSocialClient


def test_png_is_uploaded_as_jpeg(monkeypatch):
    pb = PocketBaseSocialClient()
    requests = []
    def source_response(request):
        requests.append(request)
        return httpx.Response(200, headers={"content-type": "image/jpeg"}, content=b"\xff\xd8prepared-jpeg\xff\xd9")
    pb.client = httpx.AsyncClient(transport=httpx.MockTransport(source_response))
    pb.action = AsyncMock(return_value={"prepared": True, "url": "https://api.example.com/api/overweel3d/social/public-media?grant_id=id&token=token"})

    from app.pairing import pairing_store
    pairing_store._state.update({"token": "test-token", "pocketbase_url": "https://api.example.com"})
    url = asyncio.run(pb.prepare_public_media("job-1", 0, "generated-color:#FF0000"))

    assert url == "https://api.example.com/api/overweel3d/social/public-media?grant_id=id&token=token"
    # Generated colour cards are now created locally and only the prepared,
    # public Appwrite URL is fetched for Meta validation.
    assert len(requests) == 1
    assert requests[0].url.path == "/api/overweel3d/social/public-media"
    assert "X-Overweel-Social-Token" not in requests[0].headers
    action, payload = pb.action.await_args.args
    assert action == "prepare_media"
    assert payload["job_id"] == "job-1"
    assert payload["index"] == 0
    import base64
    jpeg = base64.b64decode(payload["image_base64"])
    assert jpeg.startswith(b"\xff\xd8") and jpeg.endswith(b"\xff\xd9")
    asyncio.run(pb.close())


def test_missing_public_jpeg_is_rejected_before_meta_publish():
    source = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(source, format="PNG")
    def respond(request):
        if request.url.path == "/api/overweel3d/social/media":
            return httpx.Response(200, content=source.getvalue())
        return httpx.Response(404, json={"message": "not found"})
    pb = PocketBaseSocialClient()
    pb.client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    pb.action = AsyncMock(return_value={"prepared": True, "url": "https://api.example.com/api/overweel3d/social/public-media?grant_id=missing&token=token"})
    from app.pairing import pairing_store
    pairing_store._state.update({"token": "test-token", "pocketbase_url": "https://api.example.com"})
    try:
        asyncio.run(pb.prepare_public_media("job-1", 0, "generated-color:#FF0000"))
        assert False, "a missing public file must not reach Meta"
    except PocketBaseActionError as exc:
        assert "niet zonder aanmelding bereikbaar" in str(exc)
    finally:
        asyncio.run(pb.close())


def test_product_photo_uses_public_appwrite_source_and_prepared_copy():
    source = io.BytesIO()
    Image.new("RGB", (80, 40), "blue").save(source, format="JPEG")
    requests = []

    def respond(request):
        requests.append(request)
        if request.url.path == "/storage/buckets/public-media-v2/files/source/view":
            return httpx.Response(200, headers={"content-type": "image/jpeg"}, content=source.getvalue())
        if request.url.path == "/api/overweel3d/social/public-media":
            return httpx.Response(200, headers={"content-type": "image/jpeg"}, content=b"\xff\xd8prepared\xff\xd9")
        return httpx.Response(404, json={"message": "broken media proxy"})

    pb = PocketBaseSocialClient()
    pb.client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    async def appwrite_action(action, _payload):
        if action == "resolve_media":
            return {"url": "https://api.example.com/storage/buckets/public-media-v2/files/source/view"}
        assert action == "prepare_media"
        return {"url": "https://api.example.com/api/overweel3d/social/public-media?grant_id=prepared&token=token"}
    pb.action = AsyncMock(side_effect=appwrite_action)
    from app.pairing import pairing_store
    pairing_store._state.update({"token": "test-token", "pocketbase_url": "https://api.example.com"})

    url = asyncio.run(pb.prepare_public_media("job-2", 0, "products/id/photo.jpeg"))
    assert "grant_id=prepared" in url
    assert requests[0].url.path == "/storage/buckets/public-media-v2/files/source/view"
    assert "X-Overweel-Social-Token" not in requests[0].headers
    assert requests[1].url.path == "/api/overweel3d/social/public-media"
    assert "X-Overweel-Social-Token" not in requests[1].headers
    assert [call.args[0] for call in pb.action.await_args_list] == ["resolve_media", "prepare_media"]
    asyncio.run(pb.close())
