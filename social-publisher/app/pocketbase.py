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
    """Appwrite action failure (legacy name retained for compatibility)."""


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
    return response.text.strip()[:4000] or "Appwrite gaf geen foutdetails terug."


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
        return f"{pairing_store.appwrite_endpoint}/functions/{settings.appwrite_function_id}/executions"

    async def action(self, action: str, payload: dict[str, Any] | None = None) -> Any:
        function_payload = {
            "kind": "social",
            "name": action,
            "body": {**(payload or {}), "token": pairing_store.token},
        }
        response = await self.client.post(
            self.api_root,
            headers={"X-Appwrite-Project": settings.appwrite_project_id},
            json={"body": __import__("json").dumps(function_payload), "async": False},
        )
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise PocketBaseActionError(
                f"Appwrite-actie '{action}' mislukt ({response.status_code}): {_error_detail(response)}"
            ) from exc
        execution = response.json()
        status_code = int(execution.get("responseStatusCode") or execution.get("statusCode") or 200)
        response_body = execution.get("responseBody") or execution.get("response") or "{}"
        try:
            value = __import__("json").loads(response_body) if isinstance(response_body, str) else response_body
        except ValueError as exc:
            raise PocketBaseActionError("Appwrite Function gaf een ongeldig antwoord terug.") from exc
        if status_code >= 400 or execution.get("status") == "failed":
            message = value.get("error") if isinstance(value, dict) else str(value)
            raise PocketBaseActionError(f"Appwrite-actie '{action}' mislukt ({status_code}): {message}")
        return value.get("data", value) if isinstance(value, dict) else value

    @staticmethod
    def _generated_color(path: str) -> bytes | None:
        if not path.startswith("generated-color:#"):
            return None
        color = path.removeprefix("generated-color:")
        if len(color) != 7 or any(ch not in "#0123456789abcdefABCDEF" for ch in color):
            raise ValueError("Ongeldige gegenereerde kleur.")
        output = io.BytesIO()
        Image.new("RGB", (1024, 1024), color).save(output, format="PNG", optimize=True)
        return output.getvalue()

    async def _source_bytes(self, path: str) -> bytes:
        generated = self._generated_color(path)
        if generated is not None:
            return generated
        source = await self.action("resolve_media", {"path": path})
        url = str(source.get("url") or "") if isinstance(source, dict) else ""
        if not url.startswith(("https://", "http://")):
            raise PocketBaseActionError("Appwrite gaf geen geldige media-URL terug.")
        response = await self.client.get(url)
        response.raise_for_status()
        return response.content

    async def download_media(self, path: str, destination: Path) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(await self._source_bytes(path))
        return destination

    async def resolve_media_url(self, path: str) -> str:
        result = await self.action("resolve_media", {"path": path})
        url = str(result.get("url") or "") if isinstance(result, dict) else ""
        if not url.startswith(("https://", "http://")):
            raise PocketBaseActionError("Appwrite gaf geen geldige productafbeeldings-URL terug.")
        return url

    async def prepare_public_media(self, job_id: str, index: int, path: str) -> str:
        # The source is read over the authenticated, local integration route.
        # Never rely on the short-lived public-media grant as an input URL.
        content = await self._source_bytes(path)
        if len(content) > 30 * 1024 * 1024:
            raise ValueError("Bronafbeelding is groter dan 30 MB.")
        try:
            with Image.open(io.BytesIO(content)) as source:
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
            raise PocketBaseActionError("Appwrite gaf geen publieke URL voor de voorbereide afbeelding terug.")
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
        """Transcode a product video to Meta-compatible MP4 and host it briefly in Appwrite."""
        temp_root = settings.data_dir / "tmp"
        temp_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="social-video-", dir=temp_root) as directory:
            source = Path(directory) / "source"
            output = Path(directory) / "prepared.mp4"
            total = 0
            content = await self._source_bytes(path)
            total = len(content)
            if total > 200 * 1024 * 1024:
                raise ValueError("Productvideo is groter dan 200 MB.")
            source.write_bytes(content)
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
            raise PocketBaseActionError("Appwrite gaf geen publieke video-URL terug.")
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
