"""Central settings for the backend (env-driven, with demo-friendly defaults)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _load_dotenv() -> None:
    """Minimal .env loader. Existing env vars win; earlier files win over later ones.

    bridge-v2/backend/.env, bridge-v2/.env, then the parent repo's .env and backend/.env, so the Gemini key
    the MedPulse demo already uses is picked up without copying it.
    """
    repo = BASE_DIR.parent.parent
    for path in (BASE_DIR / ".env", BASE_DIR.parent / ".env", repo / ".env", repo / "backend" / ".env"):
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(int(default))).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    data_dir: Path = BASE_DIR / "data"
    db_path: Path = Path(os.getenv("BRIDGE_DB_PATH", str(BASE_DIR / "data" / "bridge.db")))
    seed_file: Path = BASE_DIR / "data" / "seed_records.json"
    demo_file: Path = BASE_DIR / "data" / "jnj_demo_data.json"
    # "demo" = use reference_date from the demo JSON; "today" = real date; or an ISO date
    reference_date: str = os.getenv("BRIDGE_REFERENCE_DATE", "demo")
    cors_origins: list = field(default_factory=lambda: [
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()
    ])
    # AI chain: Gemini -> Ollama -> rules
    google_api_key: str = os.getenv("GOOGLE_API_KEY", os.getenv("GEMINI_API_KEY", ""))
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    ollama_enabled: bool = _bool("OLLAMA_FALLBACK_ENABLED", True)
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL_NAME", "llama3.2")
    ollama_timeout: float = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "120"))
    ai_disabled: bool = _bool("BRIDGE_AI_DISABLED", False)  # force rules-based answers (tests, offline demos)


settings = Settings()
