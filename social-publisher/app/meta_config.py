"""Persist Meta credentials only in the container's private data volume."""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path

from .config import settings


def config_path() -> Path:
    return settings.data_dir / "meta-api.json"


def load_meta_config() -> None:
    """Environment variables take precedence over the persisted configuration."""
    path = config_path()
    if not path.is_file():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    for key in ("meta_page_access_token", "meta_page_id", "meta_instagram_user_id"):
        if not getattr(settings, key):
            setattr(settings, key, str(data.get(key) or ""))


def save_meta_config(page_access_token: str, page_id: str, instagram_user_id: str) -> None:
    token = page_access_token.strip()
    page = page_id.strip()
    instagram = instagram_user_id.strip()
    if not token or len(token) < 20:
        raise ValueError("Vul een geldige Meta Page Access Token in.")
    if not re.fullmatch(r"\d{5,30}", page) or not re.fullmatch(r"\d{5,30}", instagram):
        raise ValueError("Pagina-ID en Instagram-account-ID moeten numeriek zijn.")
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps({
        "meta_page_access_token": token,
        "meta_page_id": page,
        "meta_instagram_user_id": instagram,
    }, separators=(",", ":"))
    descriptor, temporary_path = tempfile.mkstemp(prefix=".meta-api-", dir=path.parent)
    try:
        os.chmod(temporary_path, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
        os.chmod(path, 0o600)
    finally:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)
