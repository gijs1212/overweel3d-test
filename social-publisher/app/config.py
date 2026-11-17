from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    # pocketbase_url remains as a compatibility alias for existing persisted
    # publisher-config.json files and the current pairing request shape.
    pocketbase_url: str = "https://appwrite.gijsoverweel.nl/v1"
    appwrite_endpoint: str = "https://appwrite.gijsoverweel.nl/v1"
    appwrite_project_id: str = "6af9acde00152998cadb"
    appwrite_function_id: str = "overweel3d-api"
    social_publisher_token: str = ""
    control_password: str
    poll_seconds: int = 30
    data_dir: Path = Path("/data")
    facebook_page_name: str = "Overweel3D"
    facebook_page_url: str = "https://www.facebook.com/Overweel3D"
    instagram_account_url: str = "https://www.instagram.com/overweel3d/"
    meta_page_access_token: str = ""
    meta_page_id: str = ""
    meta_instagram_user_id: str = ""
    meta_graph_version: str = "v26.0"

    @property
    def api_root(self) -> str:
        endpoint = (self.appwrite_endpoint or self.pocketbase_url).rstrip("/")
        return f"{endpoint}/functions/{self.appwrite_function_id}/executions"


settings = Settings()
