# Personal Finance & Investment Portfolio Intelligence Platform

An AI-powered personal finance dashboard that runs entirely on your computer. Track investments, retirement accounts, bank balances, loans, and net worth — with AI-powered analysis powered by OpenAI (or optionally Ollama for 100% local, private AI).

---

## Features

- **Investment Tracking** — Stocks, ETFs, mutual funds, crypto; live prices via Yahoo Finance
- **Retirement Accounts** — 401k, Traditional IRA, Roth IRA
- **Bank & Cash Accounts** — Checking, savings, cash management
- **Liabilities** — Mortgage, auto loans, student loans, credit card balances
- **Net Worth** — Real-time calculation, history, and trend charts
- **Portfolio Analytics** — Asset allocation, gain/loss, performance charts
- **Document Import** — Automatic extraction from 1099-B, 1099-DIV, and brokerage statements
- **AI Insights** — Portfolio analysis, stock research, risk assessment, and market commentary
- **Multi-user** — Multiple local accounts on one machine, each with private data
- **Privacy-first** — All financial data stays on your device; no cloud sync, no telemetry

---

## AI Providers

The app ships with a configurable AI backend. You can switch providers any time in **Settings → AI Provider** — no restart required.

| Provider | Notes |
|---|---|
| **OpenAI** (GPT-4o) | Recommended for most users. Requires a free OpenAI account and API key. |
| **Claude** (Anthropic) | Alternative cloud AI. Requires an Anthropic API key. |
| **Ollama** | Free, fully local. Your data never leaves your computer. Requires [Ollama](https://ollama.com) + a downloaded model. |
| **LM Studio** | Another local option with a graphical model manager. |

Market data (stock prices) comes from Yahoo Finance, Alpha Vantage (optional), and Stooq — no AI provider needed for prices.

---

## Installation

**For end users installing the desktop app**, see the full guide:

- **[INSTALL.md](INSTALL.md)** — Step-by-step installation, first-run setup, AI configuration, troubleshooting, and backup instructions
- **[QUICKSTART.md](QUICKSTART.md)** — One-page quick reference (5 minutes to working app)

### Download

Download the latest installer from the [Releases page](../../releases):
- **Windows:** `PersonalFinance-Setup.msi`
- **macOS:** `PersonalFinance.dmg`

---

## For Developers

### Prerequisites

- Python 3.11+
- Node.js 18+
- Rust toolchain ([rustup.rs](https://rustup.rs))
- Tauri CLI: `cargo install tauri-cli`

### Run in development mode

```bash
# Terminal 1 — backend API
cd backend
pip install -r requirements.txt
cp .env.example .env          # edit with your API key if needed
uvicorn app.main:app --reload
# → http://localhost:8000/docs

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
# → http://localhost:3000

# Terminal 3 — Tauri desktop window (points to localhost:3000)
cd frontend-tauri/src-tauri
cargo tauri dev
```

### Build release installers

```bash
# macOS / Linux
chmod +x scripts/build.sh
./scripts/build.sh

# Windows
scripts\build.bat
```

Installers land in `frontend-tauri/src-tauri/target/release/bundle/`.

### Docker (web-only, no Tauri)

```bash
docker-compose -f docker/docker-compose.yml up -d
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
```

### Project structure

```
backend/                FastAPI Python API
  app/
    api/v1/             REST endpoints (accounts, holdings, transactions, …)
    ai/                 AI client + specialist agents
    core/               Config, JWT auth, security utilities
    db/                 SQLAlchemy models + session
    services/           Portfolio engine, market data service
frontend/               Next.js 14 (App Router) web UI
frontend-tauri/         Tauri v2 desktop wrapper (Rust)
frontend-capacitor/     Capacitor mobile wrapper
scripts/                Build scripts + DB seed
docker/                 Docker Compose deployment
docs/                   Architecture docs
```

### Architecture notes

- **Auth:** JWT tokens (HS256, 24-hour expiry). Set `SECRET_KEY` in `backend/.env` for persistence across restarts.
- **Database:** SQLite, stored in the OS user-data directory when running as a Tauri app (`~/Library/Application Support/Personal Finance/` on macOS).
- **AI client:** `backend/app/ai/ai_client.py` — single `AIClient` class wrapping all four providers. Switch at runtime via `POST /api/v1/ai/settings`.
- **Market data:** Three-source fallback — Yahoo Finance → Alpha Vantage → Stooq.
- **Sidecar:** The Python backend is bundled as a PyInstaller binary and spawned by Tauri as a sidecar process.

### Known gaps (contributions welcome)

- Auth is wired but there is no password-reset flow
- Duplicate chart components in `app/dashboard/` and `components/dashboard/` — consolidation needed
- No automated tests yet (`pytest` is in requirements, test files are not)

---

## Sharing the App

See **[SHARING.md](SHARING.md)** for the full distribution guide, including:
- Code signing for macOS and Windows
- GitHub Releases workflow
- Whether to ship with a pre-configured API key or require users to bring their own
- Version bumping process

---

## Environment Variables

Create `backend/.env` (copy from `.env.example`):

```env
# Required for JWT auth persistence
SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_urlsafe(64))">

# AI provider: claude | openai | ollama | lmstudio
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o

# Optional: Claude
CLAUDE_API_KEY=
CLAUDE_MODEL=claude-opus-4-7

# Optional: Ollama (local)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3

# Market data
YAHOO_FINANCE_ENABLED=true
ALPHA_VANTAGE_API_KEY=
```

---

## Privacy & Security

- **All financial data stays local.** The SQLite database and uploaded documents are stored on your machine only.
- **No telemetry.** The app makes no analytics calls.
- **AI calls:** If you use a cloud provider (OpenAI, Claude), your portfolio data is sent to that provider's API to generate analysis. Use Ollama if you require complete local processing.
- **Passwords** are hashed with bcrypt and never stored in plaintext.

---

## License

MIT License — see [LICENSE](LICENSE) for details.
