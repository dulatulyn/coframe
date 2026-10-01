from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Coframe"

    database_url: str = "postgresql+asyncpg://localhost/coframe"
    allowed_origins: list[str] = ["http://localhost:3100", "http://127.0.0.1:3100"]
    public_app_url: str = "http://localhost:3100"

    cookie_secure: bool = False

    google_client_id: str | None = None
    google_client_secret: str | None = None
    session_ttl_days: int = 30
    invite_ttl_days: int = 7
    jam_ttl_hours: int = 24

    ydoc_save_delay: float = 1.0
    room_unload_delay: float = 30.0
    version_interval: float = 600.0
    versions_kept: int = 300

    max_xml_bytes: int = 5 * 1024 * 1024
    max_svg_bytes: int = 2 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
