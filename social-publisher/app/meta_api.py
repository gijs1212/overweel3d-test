"""Official Meta Graph publishing. Tokens never appear in URLs or logs."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import httpx

from .config import settings


class MetaApiError(RuntimeError):
    pass


class UncertainPublication(MetaApiError):
    """A write may have succeeded; an automatic retry could duplicate a post."""


@dataclass(frozen=True)
class MetaResult:
    status: str
    post_url: str = ""


class MetaGraphClient:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.root = f"https://graph.facebook.com/{settings.meta_graph_version}"
        self.client = httpx.AsyncClient(
            headers={"Authorization": f"Bearer {settings.meta_page_access_token}"},
            timeout=httpx.Timeout(60.0, connect=15.0),
            transport=transport,
        )

    @property
    def configured(self) -> bool:
        return bool(settings.meta_page_access_token and settings.meta_page_id and settings.meta_instagram_user_id)

    async def close(self) -> None:
        await self.client.aclose()

    async def request(self, method: str, path: str, *, data: dict[str, Any] | None = None,
                      params: dict[str, Any] | None = None, uncertain_on_transport: bool = False) -> dict[str, Any]:
        try:
            response = await self.client.request(method, f"{self.root}/{path.lstrip('/')}", data=data, params=params)
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            if uncertain_on_transport:
                raise UncertainPublication("Meta bevestigde de publicatie niet; handmatige controle is nodig.") from exc
            raise MetaApiError("Meta Graph is tijdelijk onbereikbaar.") from exc
        try:
            payload = response.json()
        except ValueError as exc:
            raise MetaApiError(f"Meta Graph gaf geen JSON terug (HTTP {response.status_code}).") from exc
        if response.is_error or "error" in payload:
            error = payload.get("error") or {}
            raise MetaApiError(f"Meta Graph HTTP {response.status_code}: {str(error.get('message') or 'onbekende fout')[:300]}")
        return payload

    async def check_accounts(self) -> dict[str, dict[str, str]]:
        if not self.configured:
            raise MetaApiError("Meta Page Access Token, pagina-ID of Instagram-account-ID ontbreekt in de containerconfiguratie.")
        page = await self.request("GET", settings.meta_page_id, params={"fields": "id,name,instagram_business_account"})
        linked_id = str((page.get("instagram_business_account") or {}).get("id") or "")
        if str(page.get("id")) != settings.meta_page_id:
            raise MetaApiError("De token hoort niet bij de ingestelde Facebookpagina.")
        if linked_id != settings.meta_instagram_user_id:
            raise MetaApiError("Het gekoppelde Instagram-account wijkt af van het ingestelde account-ID.")
        instagram = await self.request("GET", linked_id, params={"fields": "id,username"})
        return {
            "facebook": {"name": str(page.get("name") or ""), "url": settings.facebook_page_url},
            "instagram": {"name": str(instagram.get("username") or ""), "url": settings.instagram_account_url},
        }

    async def _ready(self, container_id: str) -> None:
        for _ in range(20):
            result = await self.request("GET", container_id, params={"fields": "status_code,status"})
            state = str(result.get("status_code") or "")
            if state == "FINISHED":
                return
            if state in {"ERROR", "EXPIRED"}:
                raise MetaApiError(f"Instagram-mediacontainer heeft status {state}.")
            await asyncio.sleep(3)
        raise MetaApiError("Instagram-mediacontainer was na 60 seconden nog niet klaar.")

    async def publish(self, platform: str, text: str, image_urls: list[str], dry_run: bool) -> MetaResult:
        await self.check_accounts()
        if platform == "instagram" and not image_urls:
            raise MetaApiError("Instagram kan niet zonder afbeelding publiceren.")
        if dry_run:
            return MetaResult("dry_run")
        if platform == "facebook":
            page_id = settings.meta_page_id
            if not image_urls:
                post = await self.request("POST", f"{page_id}/feed", data={"message": text}, uncertain_on_transport=True)
            elif len(image_urls) == 1:
                post = await self.request("POST", f"{page_id}/photos", data={"url": image_urls[0], "caption": text}, uncertain_on_transport=True)
            else:
                media_ids = []
                for url in image_urls[:10]:
                    photo = await self.request("POST", f"{page_id}/photos", data={"url": url, "published": "false"})
                    media_ids.append(str(photo["id"]))
                attachments = {f"attached_media[{index}]": '{{"media_fbid":"' + photo_id + '"}' for index, photo_id in enumerate(media_ids)}
                post = await self.request("POST", f"{page_id}/feed", data={"message": text, **attachments}, uncertain_on_transport=True)
            return MetaResult("published", f"https://www.facebook.com/{post['id']}")
        if platform == "instagram":
            ig_id = settings.meta_instagram_user_id
            if len(image_urls) == 1:
                container = await self.request("POST", f"{ig_id}/media", data={"image_url": image_urls[0], "caption": text})
                creation_id = str(container["id"])
            else:
                children = []
                for url in image_urls[:10]:
                    child = await self.request("POST", f"{ig_id}/media", data={"image_url": url, "is_carousel_item": "true"})
                    child_id = str(child["id"])
                    await self._ready(child_id)
                    children.append(child_id)
                container = await self.request("POST", f"{ig_id}/media", data={"media_type": "CAROUSEL", "children": ",".join(children), "caption": text})
                creation_id = str(container["id"])
            await self._ready(creation_id)
            published = await self.request("POST", f"{ig_id}/media_publish", data={"creation_id": creation_id}, uncertain_on_transport=True)
            media_id = str(published["id"])
            details = await self.request("GET", media_id, params={"fields": "permalink"})
            return MetaResult("published", str(details.get("permalink") or settings.instagram_account_url))
        raise MetaApiError(f"Niet-ondersteund platform: {platform}")
