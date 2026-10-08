from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    pocketbase_url: str = "https://api.gijsoverweel.nl"
    social_publisher_token: str = ""
    control_password: str
    novnc_password: str = ""
    poll_seconds: int = 30
    data_dir: Path = Path("/data")
    chromium_path: str = "/usr/bin/chromium"
    facebook_page_name: str = "Overweel3D"
    facebook_page_url: str = "https://www.facebook.com/Overweel3D"
    instagram_account_url: str = "https://www.instagram.com/overweel3d/"
    meta_page_access_token: str = ""
    meta_page_id: str = ""
    meta_instagram_user_id: str = ""
    meta_graph_version: str = "v26.0"

    @property
    def api_root(self) -> str:
        return self.pocketbase_url.rstrip("/") + "/api/overweel3d/social"


settings = Settings()
