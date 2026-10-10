import asyncio
import os

import httpx
import pytest

os.environ.setdefault("CONTROL_PASSWORD", "test-dashboard-password")

from app.config import settings
from app.meta_api import MetaGraphClient, MetaApiError, UncertainPublication


def configure(monkeypatch):
    monkeypatch.setattr(settings, "meta_page_access_token", "test-token")
    monkeypatch.setattr(settings, "meta_page_id", "123")
    monkeypatch.setattr(settings, "meta_instagram_user_id", "456")


def test_account_check_and_dry_run_do_not_publish(monkeypatch):
    configure(monkeypatch)
    calls = []

    def reply(request):
        calls.append((request.method, request.url.path))
        if request.url.path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "name": "Overweel3D", "access_token": "page-token", "instagram_business_account": {"id": "456"}})
        return httpx.Response(200, json={"id": "456", "username": "overweel3d"})

    client = MetaGraphClient(httpx.MockTransport(reply))
    result = asyncio.run(client.publish("instagram", "Een bericht", ["https://example.com/test.jpg"], True))
    assert result.status == "dry_run"
    assert calls == [("GET", "/v26.0/123"), ("GET", "/v26.0/456")]
    asyncio.run(client.close())


def test_wrong_instagram_link_blocks_publication(monkeypatch):
    configure(monkeypatch)

    def reply(request):
        return httpx.Response(200, json={"id": "123", "name": "Overweel3D", "instagram_business_account": {"id": "wrong"}})

    client = MetaGraphClient(httpx.MockTransport(reply))
    with pytest.raises(MetaApiError, match="wijkt af"):
        asyncio.run(client.publish("facebook", "Tekst", [], False))
    asyncio.run(client.close())


def test_uncertain_final_post_is_not_safe_to_retry(monkeypatch):
    configure(monkeypatch)

    def reply(request):
        if request.method == "POST":
            raise httpx.ReadTimeout("timeout")
        if request.url.path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "access_token": "page-token", "instagram_business_account": {"id": "456"}})
        return httpx.Response(200, json={"id": "456", "username": "overweel3d"})

    client = MetaGraphClient(httpx.MockTransport(reply))
    with pytest.raises(UncertainPublication):
        asyncio.run(client.publish("facebook", "Tekst", [], False))
    asyncio.run(client.close())


def test_facebook_uses_page_token_for_unpublished_photo(monkeypatch):
    configure(monkeypatch)
    photo_tokens = []

    def reply(request):
        if request.url.path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "access_token": "real-page-token", "instagram_business_account": {"id": "456"}})
        if request.url.path.endswith("/456"):
            return httpx.Response(200, json={"id": "456", "username": "overweel3d"})
        if request.url.path.endswith("/123/photos"):
            photo_tokens.append(request.headers["Authorization"])
            return httpx.Response(200, json={"id": str(len(photo_tokens))})
        return httpx.Response(200, json={"id": "post123"})

    client = MetaGraphClient(httpx.MockTransport(reply))
    result = asyncio.run(client.publish("facebook", "Test", ["https://example.com/one.jpg", "https://example.com/two.jpg"], False))
    assert result.status == "published"
    assert photo_tokens == ["Bearer real-page-token", "Bearer real-page-token"]
    asyncio.run(client.close())


def test_user_token_resolves_page_token_before_facebook_post(monkeypatch):
    configure(monkeypatch)
    used = []

    def reply(request):
        path = request.url.path
        if path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "instagram_business_account": {"id": "456"}})
        if path.endswith("/me"):
            return httpx.Response(200, json={"id": "user-1"})
        if path.endswith("/me/accounts"):
            return httpx.Response(200, json={"data": [{"id": "123", "access_token": "derived-page-token"}]})
        if path.endswith("/456"):
            return httpx.Response(200, json={"id": "456", "username": "overweel3d"})
        used.append(request.headers["Authorization"])
        return httpx.Response(200, json={"id": "post-1"})

    client = MetaGraphClient(httpx.MockTransport(reply))
    asyncio.run(client.publish("facebook", "Tekst", [], False))
    assert used == ["Bearer derived-page-token"]
    asyncio.run(client.close())
