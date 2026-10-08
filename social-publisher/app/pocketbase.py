from __future__ import annotations

from pathlib import Path
from typing import Any
import httpx

from .config import settings
from .pairing import pairing_store


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
        response.raise_for_status()
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

    async def close(self) -> None:
        await self.client.aclose()
