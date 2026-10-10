"""Official Meta Graph publishing. Tokens never appear in URLs or logs."""

from __future__ import annotations

import asyncio
import json
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
        self.page_token = ""

    @property
    def configured(self) -> bool:
        return bool(settings.meta_page_access_token and settings.meta_page_id and settings.meta_instagram_user_id)

    async def close(self) -> None:
        await self.client.aclose()

    async def request(self, method: str, path: str, *, data: dict[str, Any] | None = None,
                      params: dict[str, Any] | None = None, uncertain_on_transport: bool = False,
                      page_auth: bool = False) -> dict[str, Any]:
        try:
            headers = {"Authorization": f"Bearer {self.page_token}"} if page_auth and self.page_token else None
            response = await self.client.request(method, f"{self.root}/{path.lstrip('/')}", data=data, params=params, headers=headers)
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
            code = error.get("code")
            subcode = error.get("error_subcode")
            identifiers = ", ".join(
                part for part in (
                    f"code {code}" if code is not None else "",
                    f"subcode {subcode}" if subcode is not None else "",
                ) if part
            )
            detail = str(error.get("error_user_title") or "").strip()
            suffix = f" ({identifiers})" if identifiers else ""
            if detail:
                suffix += f" — {detail[:160]}"
            error_text = (
                f"Meta Graph HTTP {response.status_code}: "
                f"{str(error.get('message') or 'onbekende fout')[:300]}{suffix}"
            )
            if uncertain_on_transport and response.status_code >= 500:
                raise UncertainPublication(error_text + " Publicatie mogelijk al uitgevoerd; controleer het kanaal handmatig.")
            raise MetaApiError(error_text)
        return payload

    async def check_accounts(self) -> dict[str, dict[str, str]]:
        if not self.configured:
            raise MetaApiError("Meta Page Access Token, pagina-ID of Instagram-account-ID ontbreekt in de containerconfiguratie.")
        page = await self.request("GET", settings.meta_page_id, params={"fields": "id,name,instagram_business_account,access_token"})
        linked_id = str((page.get("instagram_business_account") or {}).get("id") or "")
        if str(page.get("id")) != settings.meta_page_id:
            raise MetaApiError("De token hoort niet bij de ingestelde Facebookpagina.")
        if linked_id != settings.meta_instagram_user_id:
            raise MetaApiError("Het gekoppelde Instagram-account wijkt af van het ingestelde account-ID.")
        page_token = str(page.get("access_token") or "")
        if not page_token:
            identity = await self.request("GET", "me", params={"fields": "id"})
            if str(identity.get("id")) == settings.meta_page_id:
                page_token = settings.meta_page_access_token
            else:
                accounts = await self.request("GET", "me/accounts", params={"fields": "id,access_token", "limit": "100"})
                page_token = next((str(item.get("access_token") or "") for item in accounts.get("data", []) if str(item.get("id")) == settings.meta_page_id), "")
        if not page_token:
            raise MetaApiError("Geen Facebook-paginatoken beschikbaar. Geef de Meta-app pages_show_list en pages_manage_posts en vernieuw de token.")
        self.page_token = page_token
        instagram = await self.request("GET", linked_id, params={"fields": "id,username"})
        return {
            "facebook": {"name": str(page.get("name") or ""), "url": settings.facebook_page_url},
            "instagram": {"name": str(instagram.get("username") or ""), "url": settings.instagram_account_url},
        }

    async def _ready(self, container_id: str, *, video: bool = False) -> None:
        for _ in range(100 if video else 20):
            result = await self.request("GET", container_id, params={"fields": "status_code,status"})
            state = str(result.get("status_code") or "")
            if state == "FINISHED":
                return
            if state in {"ERROR", "EXPIRED"}:
                raise MetaApiError(f"Instagram-mediacontainer heeft status {state}.")
            await asyncio.sleep(3)
        raise MetaApiError("Instagram-mediacontainer was niet op tijd klaar.")

    async def publish(self, platform: str, text: str, image_urls: list[str | dict[str, str]], dry_run: bool,
                      *, on_post=None, posted_media: dict[str, str] | None = None,
                      facebook_media_mode: str = "separate") -> MetaResult:
        await self.check_accounts()
        media = [{"kind": "image", "url": item} if isinstance(item, str) else item for item in image_urls]
        if platform == "instagram" and not media:
            raise MetaApiError("Instagram kan niet zonder foto of video publiceren.")
        if dry_run:
            return MetaResult("dry_run")
        if platform == "facebook":
            page_id = settings.meta_page_id
            if not media:
                post = await self.request("POST", f"{page_id}/feed", data={"message": text}, uncertain_on_transport=True, page_auth=True)
                return MetaResult("published", f"https://www.facebook.com/{post['id']}")
            completed = posted_media or {}
            first_url = ""
            if facebook_media_mode == "combined":
                photos = [(index, item) for index, item in enumerate(media[:10]) if item["kind"] != "video"]
                done = [(index, completed[str(index)]) for index, _ in photos if str(index) in completed]
                if done and len(done) != len(photos):
                    raise UncertainPublication("Een deel van het Facebook-fotobericht is al geregistreerd; controleer de pagina handmatig voordat je opnieuw publiceert.")
                if done:
                    first_url = done[0][1]
                elif len(photos) > 1:
                    staged_ids = []
                    for _, item in photos:
                        staged = await self.request("POST", f"{page_id}/photos", data={"url": item["url"], "published": "false"}, page_auth=True)
                        staged_ids.append(str(staged["id"]))
                    post = await self.request(
                        "POST", f"{page_id}/feed",
                        data={"message": text, "attached_media": json.dumps([{"media_fbid": media_id} for media_id in staged_ids])},
                        uncertain_on_transport=True, page_auth=True,
                    )
                    first_url = f"https://www.facebook.com/{post['id']}"
                    for index, _ in photos:
                        if on_post:
                            try:
                                await on_post(index, first_url)
                            except Exception as exc:
                                raise UncertainPublication("Facebook heeft het gezamenlijke fotobericht geplaatst, maar de registratie mislukte; controleer de pagina handmatig.") from exc
                elif photos:
                    index, item = photos[0]
                    post = await self.request("POST", f"{page_id}/photos", data={"url": item["url"], "caption": text, "published": "true"}, uncertain_on_transport=True, page_auth=True)
                    first_url = f"https://www.facebook.com/{post['id']}"
                    if on_post:
                        try:
                            await on_post(index, first_url)
                        except Exception as exc:
                            raise UncertainPublication("Facebook heeft de foto geplaatst, maar de registratie mislukte; controleer de pagina handmatig.") from exc
                # Facebook ondersteunt geen video binnen een fotobericht. Video's blijven losse berichten.
                for index, item in enumerate(media[:10]):
                    if item["kind"] != "video" or str(index) in completed:
                        continue
                    post = await self.request("POST", f"{page_id}/videos", data={"file_url": item["url"], "description": text, "published": "true"}, uncertain_on_transport=True, page_auth=True)
                    post_url = f"https://www.facebook.com/{post['id']}"
                    if on_post:
                        try:
                            await on_post(index, post_url)
                        except Exception as exc:
                            raise UncertainPublication("Facebook heeft de video geplaatst, maar de registratie mislukte; controleer de pagina handmatig.") from exc
                    first_url = first_url or post_url
                return MetaResult("published", first_url)
            for index, item in enumerate(media[:10]):
                if str(index) in completed:
                    first_url = first_url or completed[str(index)]
                    continue
                if item["kind"] == "video":
                    post = await self.request("POST", f"{page_id}/videos", data={"file_url": item["url"], "description": text, "published": "true"}, uncertain_on_transport=True, page_auth=True)
                else:
                    post = await self.request("POST", f"{page_id}/photos", data={"url": item["url"], "caption": text, "published": "true"}, uncertain_on_transport=True, page_auth=True)
                post_url = f"https://www.facebook.com/{post['id']}"
                if on_post:
                    try:
                        await on_post(index, post_url)
                    except Exception as exc:
                        raise UncertainPublication("Facebook heeft media ontvangen, maar de publicatie kon niet worden geregistreerd; controleer de pagina handmatig.") from exc
                first_url = first_url or post_url
            return MetaResult("published", first_url)
        if platform == "instagram":
            ig_id = settings.meta_instagram_user_id
            has_video = any(item["kind"] == "video" for item in media)
            if len(media) == 1:
                item = media[0]
                data = {"media_type": "REELS", "video_url": item["url"], "share_to_feed": "true", "caption": text} if item["kind"] == "video" else {"image_url": item["url"], "caption": text}
                container = await self.request("POST", f"{ig_id}/media", data=data)
                creation_id = str(container["id"])
            else:
                children = []
                for item in media[:10]:
                    data = {"media_type": "VIDEO", "video_url": item["url"], "is_carousel_item": "true"} if item["kind"] == "video" else {"image_url": item["url"], "is_carousel_item": "true"}
                    child = await self.request("POST", f"{ig_id}/media", data=data)
                    child_id = str(child["id"])
                    await self._ready(child_id, video=item["kind"] == "video")
                    children.append(child_id)
                container = await self.request("POST", f"{ig_id}/media", data={"media_type": "CAROUSEL", "children": ",".join(children), "caption": text})
                creation_id = str(container["id"])
            await self._ready(creation_id, video=has_video)
            published = await self.request("POST", f"{ig_id}/media_publish", data={"creation_id": creation_id}, uncertain_on_transport=True)
            media_id = str(published["id"])
            details = await self.request("GET", media_id, params={"fields": "permalink"})
            return MetaResult("published", str(details.get("permalink") or settings.instagram_account_url))
        raise MetaApiError(f"Niet-ondersteund platform: {platform}")
