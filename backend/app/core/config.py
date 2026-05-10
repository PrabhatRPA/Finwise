"""
Personal Finance Platform - Configuration
Handles all application configuration via environment variables
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Base directory (inside the source tree / PyInstaller bundle)
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# App-data directory: Tauri passes this as APP_DATA_DIR so the SQLite
# database and uploads live in the OS user-data folder, not the bundle.
# Falls back to the source-tree layout for plain `uvicorn` dev runs.
_APP_DATA_DIR = os.getenv("APP_DATA_DIR")
if _APP_DATA_DIR:
    _data_root = Path(_APP_DATA_DIR)
    DATABASE_DIR = _data_root / "database"
    DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATABASE_DIR / 'finance.db'}")
else:
    DATABASE_DIR = BASE_DIR / "database"
    DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATABASE_DIR / 'finance.db'}")

# AI provider settings — AI_PROVIDER: claude | openai | ollama | lmstudio
AI_PROVIDER = os.getenv("AI_PROVIDER", "claude")
AI_TIMEOUT = int(os.getenv("AI_TIMEOUT", "120"))

# Claude (Anthropic)
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY", "")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-4-7")

# OpenAI
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

# Ollama (local)
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:4b")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))

# LM Studio (local OpenAI-compatible)
LMSTUDIO_HOST = os.getenv("LMSTUDIO_HOST", "http://localhost:1234")
LMSTUDIO_MODEL = os.getenv("LMSTUDIO_MODEL", "local-model")

# Market data settings
YAHOO_FINANCE_ENABLED = os.getenv("YAHOO_FINANCE_ENABLED", "true").lower() == "true"
ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "")
STOOQ_ENABLED = os.getenv("STOOQ_ENABLED", "true").lower() == "true"

# Application settings
APP_TITLE = os.getenv("APP_TITLE", "Personal Finance Platform")
APP_ENV = os.getenv("APP_ENV", "development")
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
# tauri:// and https://tauri.localhost are the origins used by Tauri v2 on
# macOS/Linux and Windows respectively when serving from frontendDist.
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:8000,tauri://localhost,https://tauri.localhost",
).split(",")

# Property valuation — Rentcast free tier (50 calls/month, no CC required)
# Sign up at https://app.rentcast.io/app/api-access to get a key
RENTCAST_API_KEY = os.getenv("RENTCAST_API_KEY", "")

# File upload settings
UPLOAD_DIR = (_data_root / "uploads") if _APP_DATA_DIR else (BASE_DIR / "data" / "uploads")
MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", "10485760"))  # 10MB default

# Ensure directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_DIR.mkdir(parents=True, exist_ok=True)
