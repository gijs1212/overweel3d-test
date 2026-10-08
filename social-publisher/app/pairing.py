from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from .config import settings


class PairingStore:
    def __init__(self) -> None:
        self.path = settings.data_dir / "publisher-config.json"
        self._lock = RLock()
        self._state: dict[str, str] = {}
        self._load()

    def _load(self) -> None:
        with self._lock:
            if self.path.is_file():
                try:
                    self._state = json.loads(self.path.read_text(encoding="utf-8"))
                except Exception:
                    self._state = {}
            if settings.social_publisher_token and not self._state.get("token"):
                self._state["token"] = settings.social_publisher_token
                self._state["pocketbase_url"] = settings.pocketbase_url
            if not self._state.get("pairing_code"):
                self._state["pairing_code"] = self._new_code()
            self._save()

    @staticmethod
    def _new_code() -> str:
        return f"{secrets.randbelow(100_000_000):08d}"

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(self._state, indent=2), encoding="utf-8")
        os.chmod(temporary, 0o600)
        temporary.replace(self.path)

    @property
    def pairing_code(self) -> str:
        with self._lock:
            return str(self._state.get("pairing_code") or "")

    @property
    def token(self) -> str:
        with self._lock:
            return str(self._state.get("token") or "")

    @property
    def pocketbase_url(self) -> str:
        with self._lock:
            return str(self._state.get("pocketbase_url") or settings.pocketbase_url).rstrip("/")

    @property
    def paired(self) -> bool:
        return bool(self.token)

    def pair(self, code: str, token: str, pocketbase_url: str) -> None:
        with self._lock:
            if not secrets.compare_digest(str(code), self.pairing_code):
                raise ValueError("Ongeldige koppelcode.")
            if len(str(token)) < 32:
                raise ValueError("De ontvangen interne sleutel is ongeldig.")
            if not str(pocketbase_url).startswith("https://"):
                raise ValueError("PocketBase moet via HTTPS bereikbaar zijn.")
            self._state.update({
                "token": str(token),
                "pocketbase_url": str(pocketbase_url).rstrip("/"),
                "paired_at": datetime.now(timezone.utc).isoformat(),
                "pairing_code": self._new_code(),
            })
            self._save()


pairing_store = PairingStore()
