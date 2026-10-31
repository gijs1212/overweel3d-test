import asyncio
import os

import httpx
import pytest

os.environ.setdefault("CONTROL_PASSWORD", "test-dashboard-password")

from app.config import settings
from app.meta_api import MetaGraphClient, MetaApiError, MetaRateLimitError, UncertainPublication


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


def test_meta_application_limit_gets_long_cooldown(monkeypatch):
    configure(monkeypatch)

    def reply(request):
        return httpx.Response(403, json={"error": {
            "message": "Application request limit reached",
            "code": 4,
            "error_subcode": 2207051,
        }})

    client = MetaGraphClient(httpx.MockTransport(reply))
    with pytest.raises(MetaRateLimitError) as captured:
        asyncio.run(client.check_accounts())
    assert captured.value.retry_after_seconds >= 3600
    assert "aanvraaglimiet" in str(captured.value)
    asyncio.run(client.close())


def test_meta_http_500_after_photo_publish_needs_manual_check(monkeypatch):
    configure(monkeypatch)
    def reply(request):
        if request.url.path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "access_token": "page-token", "instagram_business_account": {"id": "456"}})
        if request.url.path.endswith("/456"):
            return httpx.Response(200, json={"id": "456", "username": "overweel3d"})
        return httpx.Response(500, json={"error": {"message": "An unknown error has occurred."}})
    client = MetaGraphClient(httpx.MockTransport(reply))
    with pytest.raises(UncertainPublication, match="controleer het kanaal handmatig"):
        asyncio.run(client.publish("facebook", "Product", ["https://example.com/photo.jpg"], False))
    asyncio.run(client.close())


def test_facebook_uses_page_token_for_product_photos(monkeypatch):
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


def test_facebook_publishes_photos_and_video_separately_and_records_each(monkeypatch):
    configure(monkeypatch)
    writes = []
    recorded = []
    def reply(request):
        path = request.url.path
        if path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "access_token": "page-token", "instagram_business_account": {"id": "456"}})
        if path.endswith("/456"):
            return httpx.Response(200, json={"id": "456", "username": "overweel3d"})
        writes.append((path, str(request.content)))
        return httpx.Response(200, json={"id": f"123_{len(writes)}"})
    async def record(index, url):
        recorded.append((index, url))
    client = MetaGraphClient(httpx.MockTransport(reply))
    media = [{"kind": "image", "url": "https://example.com/photo.jpg"}, {"kind": "video", "url": "https://example.com/video.mp4"}]
    result = asyncio.run(client.publish("facebook", "Product", media, False, on_post=record))
    assert result.status == "published"
    assert [path for path, _ in writes] == ["/v26.0/123/photos", "/v26.0/123/videos"]
    assert "file_url" in writes[1][1]
    assert [index for index, _ in recorded] == [0, 1]
    asyncio.run(client.close())


def test_facebook_combines_photos_in_one_feed_post(monkeypatch):
    configure(monkeypatch)
    writes = []
    recorded = []

    def reply(request):
        if request.url.path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "access_token": "page-token", "instagram_business_account": {"id": "456"}})
        if request.url.path.endswith("/456"):
            return httpx.Response(200, json={"id": "456", "username": "overweel3d"})
        if request.method == "GET" and request.url.path.endswith("/123_3"):
            return httpx.Response(200, json={"id": "123_3", "is_published": True, "permalink_url": "https://www.facebook.com/123/posts/3"})
        writes.append((request.url.path, str(request.content)))
        return httpx.Response(200, json={"id": f"123_{len(writes)}"})

    async def record(index, url):
        recorded.append((index, url))

    client = MetaGraphClient(httpx.MockTransport(reply))
    result = asyncio.run(client.publish("facebook", "Product", ["https://example.com/one.jpg", "https://example.com/two.jpg"], False,
                                        on_post=record, facebook_media_mode="combined"))
    assert [path for path, _ in writes] == ["/v26.0/123/photos", "/v26.0/123/photos", "/v26.0/123/feed"]
    assert all("published=false" in body for _, body in writes[:2])
    assert "%22media_fbid%22" in writes[2][1] and "published=true" in writes[2][1]
    assert result.post_url == "https://www.facebook.com/123/posts/3"
    assert recorded == [(0, result.post_url), (1, result.post_url)]
    asyncio.run(client.close())


def test_facebook_combined_rejects_partial_progress_to_prevent_duplicate(monkeypatch):
    configure(monkeypatch)
    writes = []

    def reply(request):
        if request.url.path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "access_token": "page-token", "instagram_business_account": {"id": "456"}})
        if request.url.path.endswith("/456"):
            return httpx.Response(200, json={"id": "456", "username": "overweel3d"})
        writes.append(request.url.path)
        return httpx.Response(200, json={"id": "123_new"})

    client = MetaGraphClient(httpx.MockTransport(reply))
    with pytest.raises(UncertainPublication, match="controleer de pagina"):
        asyncio.run(client.publish("facebook", "Product", ["already-posted://media", "https://example.com/two.jpg"], False,
                                   posted_media={"0": "https://www.facebook.com/123_1"}, facebook_media_mode="combined"))
    assert writes == []
    asyncio.run(client.close())


def test_facebook_combined_keeps_video_as_separate_post(monkeypatch):
    configure(monkeypatch)
    writes = []

    def reply(request):
        if request.url.path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "access_token": "page-token", "instagram_business_account": {"id": "456"}})
        if request.url.path.endswith("/456"):
            return httpx.Response(200, json={"id": "456", "username": "overweel3d"})
        if request.method == "GET" and request.url.path.endswith("/123_3"):
            return httpx.Response(200, json={"id": "123_3", "is_published": True, "permalink_url": "https://www.facebook.com/123/posts/3"})
        writes.append(request.url.path)
        return httpx.Response(200, json={"id": f"123_{len(writes)}"})

    client = MetaGraphClient(httpx.MockTransport(reply))
    media = [
        {"kind": "image", "url": "https://example.com/one.jpg"},
        {"kind": "video", "url": "https://example.com/clip.mp4"},
        {"kind": "image", "url": "https://example.com/two.jpg"},
    ]
    result = asyncio.run(client.publish("facebook", "Product", media, False, facebook_media_mode="combined"))
    assert result.status == "published"
    assert writes == ["/v26.0/123/photos", "/v26.0/123/photos", "/v26.0/123/feed", "/v26.0/123/videos"]
    asyncio.run(client.close())


def test_facebook_combined_rejects_unpublished_feed_post(monkeypatch):
    configure(monkeypatch)

    def reply(request):
        if request.url.path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "access_token": "page-token", "instagram_business_account": {"id": "456"}})
        if request.url.path.endswith("/456"):
            return httpx.Response(200, json={"id": "456", "username": "overweel3d"})
        if request.method == "GET":
            return httpx.Response(200, json={"id": "123_3", "is_published": False})
        if request.url.path.endswith("/123/feed"):
            return httpx.Response(200, json={"id": "123_3"})
        return httpx.Response(200, json={"id": "photo-id"})

    client = MetaGraphClient(httpx.MockTransport(reply))
    with pytest.raises(MetaApiError, match="niet gepubliceerd"):
        asyncio.run(client.publish("facebook", "Product", ["https://example.com/one.jpg", "https://example.com/two.jpg"], False,
                                   facebook_media_mode="combined"))
    asyncio.run(client.close())


def test_facebook_retry_skips_already_recorded_photo(monkeypatch):
    configure(monkeypatch)
    writes = []
    def reply(request):
        if request.url.path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "access_token": "page-token", "instagram_business_account": {"id": "456"}})
        if request.url.path.endswith("/456"):
            return httpx.Response(200, json={"id": "456", "username": "overweel3d"})
        writes.append(request.url.path)
        return httpx.Response(200, json={"id": "123_2"})
    client = MetaGraphClient(httpx.MockTransport(reply))
    media = [{"kind": "image", "url": "already-posted://media"}, {"kind": "video", "url": "https://example.com/video.mp4"}]
    asyncio.run(client.publish("facebook", "Product", media, False, posted_media={"0": "https://www.facebook.com/123_1"}))
    assert writes == ["/v26.0/123/videos"]
    asyncio.run(client.close())


def test_instagram_mixed_carousel_uses_video_url(monkeypatch):
    configure(monkeypatch)
    media_requests = []
    def reply(request):
        path = request.url.path
        if path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "access_token": "page-token", "instagram_business_account": {"id": "456"}})
        if path.endswith("/456"):
            return httpx.Response(200, json={"id": "456", "username": "overweel3d"})
        if path.endswith("/456/media"):
            media_requests.append(str(request.content))
            return httpx.Response(200, json={"id": str(len(media_requests))})
        if path.endswith("/456/media_publish"):
            return httpx.Response(200, json={"id": "published-id"})
        if path.endswith("/published-id"):
            return httpx.Response(200, json={"permalink": "https://www.instagram.com/p/test/"})
        return httpx.Response(200, json={"status_code": "FINISHED"})
    client = MetaGraphClient(httpx.MockTransport(reply))
    media = [{"kind": "image", "url": "https://example.com/photo.jpg"}, {"kind": "video", "url": "https://example.com/video.mp4"}]
    result = asyncio.run(client.publish("instagram", "Product", media, False))
    assert result.status == "published"
    assert "image_url" in media_requests[0]
    assert "video_url" in media_requests[1] and "media_type=VIDEO" in media_requests[1]
    assert "media_type=CAROUSEL" in media_requests[2]
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
        if request.method == "GET" and path.endswith("/post-1"):
            used.append(request.headers["Authorization"])
            return httpx.Response(200, json={"id": "post-1", "is_published": True, "permalink_url": "https://www.facebook.com/123/posts/1"})
        used.append(request.headers["Authorization"])
        return httpx.Response(200, json={"id": "post-1"})

    client = MetaGraphClient(httpx.MockTransport(reply))
    asyncio.run(client.publish("facebook", "Tekst", [], False))
    assert used == ["Bearer derived-page-token", "Bearer derived-page-token"]
    asyncio.run(client.close())


def test_instagram_media_fetch_error_keeps_safe_meta_codes(monkeypatch):
    configure(monkeypatch)
    posted_urls = []

    def reply(request):
        if request.url.path.endswith("/123"):
            return httpx.Response(200, json={"id": "123", "access_token": "page-token", "instagram_business_account": {"id": "456"}})
        if request.url.path.endswith("/456"):
            return httpx.Response(200, json={"id": "456", "username": "overweel3d"})
        if request.url.path.endswith("/456/media"):
            posted_urls.append(str(request.content))
            return httpx.Response(400, json={"error": {
                "message": "Only photo or video can be accepted as media type.",
                "code": 9004, "error_subcode": 2207052,
                "error_user_title": "Media download has failed.",
            }})
        raise AssertionError(f"unexpected request: {request.url.path}")

    client = MetaGraphClient(httpx.MockTransport(reply))
    with pytest.raises(MetaApiError) as raised:
        asyncio.run(client.publish("instagram", "Tekst", ["https://api.example.com/ready.jpg"], False))
    assert "code 9004" in str(raised.value)
    assert "subcode 2207052" in str(raised.value)
    assert "Media download has failed" in str(raised.value)
    assert "ready.jpg" in posted_urls[0]
    asyncio.run(client.close())
