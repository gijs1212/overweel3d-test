from urllib.parse import urlparse


def media_limit(platform: str) -> int:
    """Return the platform media cap used before opening a composer."""
    return 10


def profile_name_from_url(url: str, fallback: str) -> str:
    try:
        path = urlparse(url).path.strip("/")
        if path:
            return path.split("/")[0]
    except Exception:
        pass
    return fallback


def retry_delay_seconds(attempt: int) -> int | None:
    """Shared retry policy: 1, 5 and 15 minutes, then manual attention."""
    delays = (60, 300, 900)
    return delays[attempt] if 0 <= attempt < len(delays) else None
