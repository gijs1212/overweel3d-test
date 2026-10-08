from __future__ import annotations

import asyncio
import logging
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import settings
from .meta_api import MetaApiError, MetaGraphClient, UncertainPublication
from .pocketbase import PocketBaseSocialClient
from .policy import media_limit
from .publishers import BrowserManager, ManualAttention, check_meta_accounts, publish_meta

log = logging.getLogger("overweel3d.social")


class SocialWorker:
    def __init__(self) -> None:
        self.pb = PocketBaseSocialClient()
        self.browsers = BrowserManager()
        self.meta = MetaGraphClient()
        self.stop_event = asyncio.Event()
        self.wake_event = asyncio.Event()
        self.connected = False
        self.hook_ready = False
        self.last_heartbeat_at = ""
        self.last_connection_error = ""
        self._heartbeat_lock = asyncio.Lock()

    @property
    def is_connected(self) -> bool:
        if not self.connected or not self.last_heartbeat_at:
            return False
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(self.last_heartbeat_at)).total_seconds()
        return age <= max(90, settings.poll_seconds * 3)

    def request_immediate_poll(self) -> None:
        """Wake the queue worker after pairing."""
        self.wake_event.set()

    async def heartbeat(self) -> bool:
        if not self.pb.paired:
            self.connected = False
            self.hook_ready = False
            return False
        async with self._heartbeat_lock:
            try:
                response = await self.pb.action("heartbeat", {"version": "2.2.0"})
                if not isinstance(response, dict) or response.get("connected") is not True:
                    raise RuntimeError("PocketBase heeft de heartbeat niet bevestigd.")
                if response.get("hook_version") != "1.13.0":
                    raise RuntimeError("PocketBase-hook 1.13.0 is nodig voordat publicatietaken worden opgehaald.")
            except Exception as exc:
                self.connected = False
                self.hook_ready = False
                self.last_connection_error = str(exc)
                log.warning("PocketBase-heartbeat mislukt: %s", exc)
                return False
            self.connected = True
            was_ready = self.hook_ready
            self.hook_ready = True
            self.last_heartbeat_at = datetime.now(timezone.utc).isoformat()
            self.last_connection_error = ""
            log.info("Heartbeat door PocketBase bevestigd.")
            if not was_ready:
                self.request_immediate_poll()
            return True

    async def heartbeat_loop(self) -> None:
        while not self.stop_event.is_set():
            await self.heartbeat()
            try:
                await asyncio.wait_for(self.stop_event.wait(), timeout=settings.poll_seconds)
            except asyncio.TimeoutError:
                pass

    async def prepare_media(self, job: dict[str, Any], platform: str) -> tuple[Path, list[Path]]:
        job_id = str(job["id"])
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", job_id):
            raise ValueError("Ongeldige wachtrijtaak-ID.")
        folder = settings.data_dir / "tmp" / job_id / platform
        shutil.rmtree(folder, ignore_errors=True)
        folder.mkdir(parents=True, exist_ok=True)
        limit = media_limit(platform)
        paths: list[Path] = []
        try:
            for index, source in enumerate((job.get("media_paths") or [])[:limit]):
                suffix = Path(str(source)).suffix or ".jpg"
                paths.append(await self.pb.download_media(str(source), folder / f"{index + 1}{suffix}"))
        except Exception:
            shutil.rmtree(folder, ignore_errors=True)
            raise
        return folder, paths

    async def publish_platform(self, job: dict[str, Any], platform: str) -> None:
        try:
            text = str((job.get("texts") or {}).get(platform) or "")
            dry_run = bool(job.get("dry_run", True))
            if platform in {"facebook", "instagram"}:
                image_urls = list(job.get("media_urls") or [])[:media_limit(platform)]
                result = await self.meta.publish(platform, text, image_urls, dry_run)
            else:
                raise ValueError(f"Niet-ondersteund platform: {platform}")
            await self.pb.action("session", {"platform": platform, "status": "connected", "error": "", "screenshot_path": ""})
            await self.pb.action("report", {
                "job_id": job["id"], "platform": platform, "status": result.status,
                "post_url": result.post_url,
            })
        except (UncertainPublication, MetaApiError) as exc:
            status = "manual_attention" if isinstance(exc, UncertainPublication) or not self.meta.configured else "failed"
            await self.pb.action("session", {"platform": platform, "status": "manual_attention", "error": str(exc), "screenshot_path": ""})
            await self.pb.action("report", {"job_id": job["id"], "platform": platform, "status": status, "error": str(exc)})
        except Exception as exc:
            log.exception("Publiceren op %s mislukt", platform)
            await self.pb.action("report", {"job_id": job["id"], "platform": platform, "status": "failed", "error": str(exc)})

    async def tick(self) -> None:
        if not self.pb.paired or not self.hook_ready:
            return
        response = await self.pb.action("poll", {"version": "2.2.0", "meta_ready": self.meta.configured})
        job = response.get("job") if isinstance(response, dict) else None
        if not job:
            return
        if job.get("source_type") == "session_check":
            try:
                accounts = await self.meta.check_accounts()
            except Exception as exc:
                log.exception("Meta-accountcontrole mislukt")
                failure = {
                    "status": "disconnected", "error": str(exc), "screenshot_path": "",
                    "check_steps": ["Meta Graph API controleren", f"Controle afgebroken: {exc}"],
                }
                payload = {
                    "facebook": {**failure, "account_name": settings.facebook_page_name, "account_url": settings.facebook_page_url},
                    "instagram": {**failure, "account_name": "Instagram", "account_url": settings.instagram_account_url},
                }
            else:
                payload = {
                    platform: {
                        "status": "connected",
                        "error": "",
                        "screenshot_path": "",
                        "account_name": accounts[platform]["name"],
                        "account_url": accounts[platform]["url"],
                        "check_steps": ["Meta Graph API: pagina en gekoppeld Instagram-account bevestigd"],
                    }
                    for platform in ("facebook", "instagram")
                }
            await self.pb.action("session_check_result", {"job_id": job["id"], "results": payload})
            return
        platforms = list(job.get("platforms") or [])
        for platform in platforms:
            if platform in {"facebook", "instagram"}:
                await self.publish_platform(job, platform)

    async def run(self) -> None:
        heartbeat_task = asyncio.create_task(self.heartbeat_loop())
        try:
            while not self.stop_event.is_set():
                self.wake_event.clear()
                try:
                    await self.tick()
                except Exception:
                    log.exception("Publisher-poll mislukt")
                if self.stop_event.is_set():
                    break
                try:
                    await asyncio.wait_for(self.wake_event.wait(), timeout=settings.poll_seconds)
                except asyncio.TimeoutError:
                    pass
        finally:
            self.stop_event.set()
            await heartbeat_task
