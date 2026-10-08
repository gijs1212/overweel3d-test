import os
import sys
from pathlib import Path

import pytest

os.environ.setdefault("CONTROL_PASSWORD", "test-dashboard-password")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.meta_config import config_path, load_meta_config, save_meta_config


def test_meta_credentials_persist_without_entering_source_tree(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    for key in ("meta_page_access_token", "meta_page_id", "meta_instagram_user_id"):
        monkeypatch.setattr(settings, key, "")
    save_meta_config("example-token-that-is-long-enough", "1269529766253416", "17841400000000000")
    assert config_path().parent == tmp_path
    assert config_path().is_file()
    load_meta_config()
    assert settings.meta_page_id == "1269529766253416"
    assert settings.meta_instagram_user_id == "17841400000000000"
    assert settings.meta_page_access_token.startswith("example-token")
    if os.name != "nt":
        assert config_path().stat().st_mode & 0o777 == 0o600


def test_reject_invalid_ids(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    with pytest.raises(ValueError):
        save_meta_config("example-token-that-is-long-enough", "wrong", "17841400000000000")
    assert not config_path().exists()
