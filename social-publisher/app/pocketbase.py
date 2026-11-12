from __future__ import annotations

from pathlib import Path
from typing import Any
import asyncio
import base64
import io
import tempfile
import httpx
from PIL import Image, ImageOps, UnidentifiedImageError

from .config import settings
from .pairing import pairing_store


class PocketBaseActionError(RuntimeError):
    """PocketBase action failure with the safe server response preserved."""


def _error_detail(response: httpx.Response) -> str:
    try:
        value = response.json()
    except ValueError:
        value = None
    if isinstance(value, dict):
        message = str(value.get("message") or "").strip()
        data = value.get("data")
        if data:
            serialized = str(data)
            return f"{message}: {serialized}"[:4000] if message else serialized[:4000]
        if message:
            return message[:4000]
    return response.text.strip()[:4000] or "PocketBase gaf geen foutdetails terug."


class PocketBaseSocialClient:
    def __init__(self) -> None:
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=20.0))

    @property
    def headers(self) -> dict[str, str]:
        return {"X-Overweel-Social-Token": pairing_store.token}

    @property
    def paired(self) -> bool:
        return pairing_store.paired

    @property
    def api_root(self) -> str:
        return pairing_store.pocketbase_url + "/api/overweel3d/social"

    async def action(self, action: str, payload: dict[str, Any] | None = None) -> Any:
        response = await self.client.post(
            f"{self.api_root}/{action}", headers=self.headers, json=payload or {},
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise PocketBaseActionError(
                f"PocketBase-actie '{action}' mislukt ({response.status_code}): {_error_detail(response)}"
            ) from exc
        value = response.json()
        return value.get("data", value)

    async def download_media(self, path: str, destination: Path) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        url = f"{self.api_root}/media"
        headers = self.headers
        params = {"path": path}
        async with self.client.stream(
            "GET", url, headers=headers, params=params,
        ) as response:
            response.raise_for_status()
            with destination.open("wb") as output:
                async for chunk in response.aiter_bytes():
                    output.write(chunk)
        return destination

    async def resolve_media_url(self, path: str) -> str:
        result = await self.action("resolve_media", {"path": path})
        url = str(result.get("url") or "") if isinstance(result, dict) else ""
        expected = pairing_store.pocketbase_url + "/api/files/storage_files/"
        if not url.startswith(expected):
            raise PocketBaseActionError("PocketBase gaf geen geldige productafbeeldings-URL terug.")
        return url

    async def prepare_public_media(self, job_id: str, index: int, path: str) -> str:
        # The source is read over the authenticated, local integration route.
        # Never rely on the short-lived public-media grant as an input URL.
        response = await self.client.get(
            f"{self.api_root}/media", headers=self.headers, params={"path": path},
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise PocketBaseActionError(
                f"Bronafbeelding niet bereikbaar ({response.status_code}): {path}"
            ) from exc
        if len(response.content) > 30 * 1024 * 1024:
            raise ValueError("Bronafbeelding is groter dan 30 MB.")
        try:
            with Image.open(io.BytesIO(response.content)) as source:
                if source.width * source.height > 40_000_000:
                    raise ValueError("Bronafbeelding is te groot om te verwerken.")
                photo = ImageOps.exif_transpose(source).convert("RGB")
                photo.thumbnail((2048, 2048))
                output = io.BytesIO()
                photo.save(output, format="JPEG", quality=88, optimize=True)
        except UnidentifiedImageError as exc:
            raise ValueError("De bronafbeelding is geen ondersteund afbeeldingsbestand.") from exc
        prepared = await self.action("prepare_media", {
            "job_id": job_id, "index": index,
            "image_base64": base64.b64encode(output.getvalue()).decode("ascii"),
        })
        url = str(prepared.get("url") or "") if isinstance(prepared, dict) else ""
        if not url.startswith(("https://", "http://")):
            raise PocketBaseActionError("PocketBase gaf geen publieke URL voor de voorbereide afbeelding terug.")
        # This is the exact URL Meta will fetch. The authenticated source can
        # succeed while the public file URL is still missing or serves JSON.
        try:
            public_response = await self.client.get(url)
            public_response.raise_for_status()
        except httpx.HTTPError as exc:
            raise PocketBaseActionError(
                "De voorbereide afbeelding is niet zonder aanmelding bereikbaar voor Instagram."
            ) from exc
        content_type = public_response.headers.get("content-type", "").split(";", 1)[0].lower()
        if content_type != "image/jpeg" or not public_response.content.startswith(b"\xff\xd8"):
            raise PocketBaseActionError(
                "De publieke afbeeldingslink levert geen JPEG; Instagram kan deze media niet ophalen."
            )
        return url

    async def prepare_public_video(self, job_id: str, index: int, path: str) -> str:
        """Transcode a product video to Meta-compatible MP4 and host it briefly in PocketBase."""
        temp_root = settings.data_dir / "tmp"
        temp_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="social-video-", dir=temp_root) as directory:
            source = Path(directory) / "source"
            output = Path(directory) / "prepared.mp4"
            total = 0
            async with self.client.stream(
                "GET", f"{self.api_root}/media", headers=self.headers, params={"path": path},
            ) as response:
                response.raise_for_status()
                with source.open("wb") as target:
                    async for chunk in response.aiter_bytes():
                        total += len(chunk)
                        if total > 200 * 1024 * 1024:
                            raise ValueError("Productvideo is groter dan 200 MB.")
                        target.write(chunk)
            process = await asyncio.create_subprocess_exec(
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
                "-vf", "scale=trunc(min(iw\\,1920)/2)*2:-2", "-r", "30",
                "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(output),
                stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE,
            )
            try:
                _, stderr = await asyncio.wait_for(process.communicate(), timeout=600)
            except TimeoutError:
                process.kill()
                await process.communicate()
                raise ValueError("Omzetten van productvideo duurde te lang.") from None
            if process.returncode != 0 or not output.is_file():
                raise ValueError(f"Productvideo kon niet naar MP4 worden omgezet: {stderr.decode(errors='replace')[-300:]}")
            video = output.read_bytes()
            if len(video) > 20 * 1024 * 1024:
                raise ValueError("De omgezette productvideo is groter dan 20 MB.")
            prepared = await self.action("prepare_media", {
                "job_id": job_id, "index": index, "media_kind": "video",
                "video_base64": base64.b64encode(video).decode("ascii"),
            })
        url = str(prepared.get("url") or "") if isinstance(prepared, dict) else ""
        if not url.startswith(("https://", "http://")):
            raise PocketBaseActionError("PocketBase gaf geen publieke video-URL terug.")
        try:
            async with self.client.stream("GET", url) as response:
                response.raise_for_status()
                if response.headers.get("content-type", "").split(";", 1)[0].lower() != "video/mp4":
                    raise PocketBaseActionError("De publieke video-URL levert geen MP4-bestand.")
        except httpx.HTTPError as exc:
            raise PocketBaseActionError(
                "De voorbereide video is niet zonder aanmelding bereikbaar voor Meta."
            ) from exc
        return url

    async def close(self) -> None:
        await self.client.aclose()
