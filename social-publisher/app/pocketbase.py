from __future__ import annotations

from pathlib import Path
from typing import Any
import base64
import io
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
        async with self.client.stream(
            "GET", f"{self.api_root}/media", headers=self.headers, params={"path": path},
        ) as response:
            response.raise_for_status()
            with destination.open("wb") as output:
                async for chunk in response.aiter_bytes():
                    output.write(chunk)
        return destination

    async def prepare_public_media(self, job_id: str, index: int, path: str) -> str:
        # The source is read over the authenticated, local integration route.
        # Never rely on the short-lived public-media grant as an input URL.
        response = await self.client.get(
            f"{self.api_root}/media", headers=self.headers, params={"path": path},
        )
        response.raise_for_status()
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
        return url

    async def close(self) -> None:
        await self.client.aclose()
