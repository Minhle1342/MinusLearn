from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017/minuslearn"
    mongodb_db: str = "minuslearn"
    jwt_secret: str = "development-only-change-me-at-least-32-bytes"
    cors_origins: str = "http://localhost:5173"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    cookie_secure: bool = False
    ollama_base_url: str = "http://127.0.0.1:11434"
    mascot_model: str = "qwen2.5:1.5b"
    mascot_timeout_seconds: float = 30.0
    mascot_max_tokens: int = 220
    youtube_proxy_url: str = ""
    youtube_cookies_file: str = ""
    youtube_request_interval_seconds: float = 5.0
    youtube_transcript_cache_ttl_seconds: int = 21_600
    youtube_transcript_mode: str = "local"
    youtube_whisper_model: str = "base.en"
    youtube_whisper_device: str = "cpu"
    youtube_whisper_compute_type: str = "int8"
    youtube_whisper_max_duration_seconds: int = 7_200

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
