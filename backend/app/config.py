from __future__ import annotations
import os
from dotenv import load_dotenv

load_dotenv()


def _clean_env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _normalize_base_url(value: str, default: str) -> str:
    normalized = (value or default).strip()
    return normalized.rstrip("/")


def _build_callback_url(env_name: str, default_path: str, frontend_base_url: str) -> str:
    value = _clean_env(env_name)
    if value:
        return value
    return f"{frontend_base_url}{default_path}"


def _parse_csv_env(name: str, default_values: list[str]) -> list[str]:
    raw = _clean_env(name)
    if raw:
        values = [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]
        if values:
            return values
    deduped: list[str] = []
    for item in default_values:
        normalized = item.strip().rstrip("/")
        if normalized and normalized not in deduped:
            deduped.append(normalized)
    return deduped


OPENAI_API_KEY = _clean_env("OPENAI_API_KEY")
OPENAI_MODEL = _clean_env("OPENAI_MODEL", "gpt-5.4")
OPENAI_TRANSCRIBE_MODEL = _clean_env("OPENAI_TRANSCRIBE_MODEL", "whisper-1")

DATABASE_URL = _clean_env("DATABASE_URL", "sqlite:///./data.db")

# SERPER (Google Search via API) — recomendado para "procurar concorrentes"
SERPER_API_KEY = _clean_env("SERPER_API_KEY")
SERPER_GL = _clean_env("SERPER_GL", "br")
SERPER_HL = _clean_env("SERPER_HL", "pt-br")
SERPER_LOCATION = _clean_env("SERPER_LOCATION", "Brazil")

# Web Search (Serper) para chat
ENABLE_WEB_SEARCH = _clean_env("ENABLE_WEB_SEARCH", "false").lower() in {"1", "true", "yes", "y"}
WEB_SEARCH_MAX_RESULTS = int(_clean_env("WEB_SEARCH_MAX_RESULTS", "5"))

APP_FRONTEND_URL = _normalize_base_url(_clean_env("APP_FRONTEND_URL", "http://localhost:5173"), "http://localhost:5173")
DEFAULT_LOCAL_FRONTEND_URL = "http://localhost:5173"
DEFAULT_PRODUCTION_FRONTEND_URL = "https://www.bobou.com.br"

CORS_ALLOWED_ORIGINS = _parse_csv_env(
    "CORS_ALLOWED_ORIGINS",
    [
        APP_FRONTEND_URL,
        DEFAULT_LOCAL_FRONTEND_URL,
        DEFAULT_PRODUCTION_FRONTEND_URL,
        "https://bobou.com.br",
    ],
)

# LINKEDIN OAUTH2
LINKEDIN_CLIENT_ID = _clean_env("LINKEDIN_CLIENT_ID")
LINKEDIN_CLIENT_SECRET = _clean_env("LINKEDIN_CLIENT_SECRET")
LINKEDIN_REDIRECT_URI = _build_callback_url("LINKEDIN_REDIRECT_URI", "/auth/linkedin/callback", APP_FRONTEND_URL)

# META / INSTAGRAM
INSTAGRAM_META_APP_ID = _clean_env("INSTAGRAM_META_APP_ID")
INSTAGRAM_META_APP_SECRET = _clean_env("INSTAGRAM_META_APP_SECRET")
INSTAGRAM_META_REDIRECT_URI = _build_callback_url("INSTAGRAM_META_REDIRECT_URI", "/auth/facebook/callback", APP_FRONTEND_URL)

# META / FACEBOOK
FACEBOOK_META_APP_ID = _clean_env("FACEBOOK_META_APP_ID")
FACEBOOK_META_APP_SECRET = _clean_env("FACEBOOK_META_APP_SECRET")
FACEBOOK_META_REDIRECT_URI = _build_callback_url("FACEBOOK_META_REDIRECT_URI", "/auth/facebook/callback", APP_FRONTEND_URL)

META_GRAPH_VERSION = _clean_env("META_GRAPH_VERSION", "v23.0")

# YOUTUBE
YOUTUBE_CLIENT_ID = _clean_env("YOUTUBE_CLIENT_ID")
YOUTUBE_CLIENT_SECRET = _clean_env("YOUTUBE_CLIENT_SECRET")
YOUTUBE_REDIRECT_URI = _build_callback_url("YOUTUBE_REDIRECT_URI", "/auth/youtube/callback", APP_FRONTEND_URL)

# TIKTOK
TIKTOK_CLIENT_KEY = _clean_env("TIKTOK_CLIENT_KEY")
TIKTOK_CLIENT_SECRET = _clean_env("TIKTOK_CLIENT_SECRET")
TIKTOK_REDIRECT_URI = _build_callback_url("TIKTOK_REDIRECT_URI", "/auth/tiktok/callback", APP_FRONTEND_URL)

# GOOGLE BUSINESS PROFILE
GOOGLE_BUSINESS_CLIENT_ID = _clean_env("GOOGLE_BUSINESS_CLIENT_ID")
GOOGLE_BUSINESS_CLIENT_SECRET = _clean_env("GOOGLE_BUSINESS_CLIENT_SECRET")
GOOGLE_BUSINESS_REDIRECT_URI = _build_callback_url("GOOGLE_BUSINESS_REDIRECT_URI", "/auth/google-business/callback", APP_FRONTEND_URL)
