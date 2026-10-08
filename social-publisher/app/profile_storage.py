from pathlib import Path
import shutil


def clear_social_profiles(data_dir: Path) -> None:
    """Remove the Meta browser session without touching other publisher data."""
    profile_root = data_dir / "browser-profiles"
    shutil.rmtree(profile_root / "meta", ignore_errors=True)
    profile_root.mkdir(parents=True, exist_ok=True)
