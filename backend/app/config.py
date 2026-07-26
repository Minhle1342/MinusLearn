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
    gemini_live_api_key: str = ""
    gemini_live_model: str = "gemini-3.1-flash-live-preview"
    gemini_live_token_timeout_seconds: float = 12.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
