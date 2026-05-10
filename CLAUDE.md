# Personal Finance & Investment Portfolio Intelligence Platform

Privacy-first, fully local AI-powered finance dashboard. All data stays on-device — no cloud services, no telemetry.

## Architecture

```
frontend/          Next.js 14 (App Router) web UI
frontend-tauri/    Tauri desktop wrapper (Rust)
frontend-capacitor/ Capacitor mobile wrapper
backend/           FastAPI Python API
database/          SQLite schema + seed SQL
docker/            Docker Compose deployment
scripts/           DB init and seed scripts
docs/              Architecture and API docs
```

### Key design principles
- **Local-first**: SQLite database, Claude (Anthropic) as the default AI provider (switchable to Ollama/OpenAI/LM Studio via `AI_PROVIDER` in `.env`), no external auth or cloud storage
- **Layered**: Presentation → FastAPI → Services + AI Agents → DB / Market APIs
- **Multi-platform**: Same Next.js frontend ships as web, Tauri desktop, and Capacitor mobile

## Backend (FastAPI + Python 3.11+)

Entry point: `backend/app/main.py`

### API routes (all under `/api/v1/`)
- `accounts.py` — investment, retirement, bank accounts CRUD
- `holdings.py` — stock/ETF holdings with live price enrichment
- `net_worth.py` — current net worth, history, trends, allocations
- `transactions.py` — trade transaction CRUD
- `documents.py` — PDF upload and AI-powered extraction
- `market.py` — market price lookups, batch prices, history
- `ai.py` — portfolio analysis, stock analysis, risk, suggestions

### Core services
- `backend/app/services/portfolio_engine.py` — `PortfolioEngine`: cost basis, asset allocation, performance, health score, net worth calc
- `backend/app/services/market_data.py` — `MarketDataService`: multi-source fallback (Yahoo Finance → Alpha Vantage → Stooq), batch prices, caching
- `backend/app/agents/parsers/pdf_parser.py` — `PDFParser`: hybrid extraction (regex + LLM), OCR fallback, 1099-B/1099-DIV parsers
- `backend/app/ai/agent.py` — `AIOrchestrator` + specialist agents (Portfolio, Stock, DocumentExtraction, MarketInsights, RiskAssessment)
- `backend/app/ai/ollama_client.py` — `OllamaClient` singleton wrapping the Ollama HTTP API

### Prompts
- `backend/app/ai/prompts/extraction_prompts.py` — document extraction (1099-B, 1099-DIV, portfolio, account balance)
- `backend/app/ai/prompts/insights_prompts.py` — portfolio insights, risk, diversification, tax strategy, rebalancing
- `backend/app/ai/prompts/analysis_prompts.py` — stock analysis, net worth, market outlook, retirement planning, tax optimization

### Database
- `backend/app/db/models.py` — SQLAlchemy ORM: `User`, `Account`, `Holding`, `Transaction`, `BankAccount`, `Loan`, `MarketPrice`, `PortfolioHistory`, `Document`, `AIProcessedDocument`, `PortfolioAllocation`, `Setting`
- `backend/app/db/__init__.py` — `get_db` session factory, `init_db`
- `backend/app/core/config.py` — `DATABASE_URL`, `OLLAMA_HOST`, `YAHOO_FINANCE_ENABLED`, `ALPHA_VANTAGE_API_KEY`, `UPLOAD_DIR`
- `backend/app/core/security.py` — password hashing (bcrypt), JWT stub (`create_access_token` is a placeholder — auth not yet wired up)
- `database/schema.sql` — raw SQL schema including analytics views and triggers

### Running the backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# API docs: http://localhost:8000/docs
```

## Frontend (Next.js 14 + TypeScript)

### Key files
- `frontend/app/dashboard/page.tsx` — `DashboardPage`: main hub, fetches holdings + net worth, composes all dashboard widgets
- `frontend/app/lib/api.ts` — typed API client (axios): `holdingsApi`, `accountsApi`, `transactionsApi`, `documentsApi`, `marketApi`, `aiApi`, `netWorthApi`
- `frontend/app/lib/store.ts` — `usePortfolioStore` (Zustand): global holdings/accounts state
- `frontend/lib/utils.ts` — `formatCurrency`, `formatNumber`, `formatPercent`, `formatDate`, `cn`

### Component structure
```
frontend/app/dashboard/       Page-level dashboard components (fetching, composition)
frontend/components/dashboard/ Reusable presentational dashboard widgets
frontend/components/ui/        Primitive UI components: Card, Badge, Table, Button, Input, Tabs
```

> **Note**: Several chart components are duplicated between `frontend/app/dashboard/` and `frontend/components/dashboard/` (e.g. `AssetAllocationDonutChart`, `NetWorthTrendChart`, `PortfolioPerformanceChart`). Consolidation is a known cleanup task.

### Running the frontend
```bash
cd frontend
npm install
npm run dev
# http://localhost:3000
```

## Desktop (Tauri v2)

### Architecture
- **Frontend**: Next.js static export (`output: 'export'`) → `frontend/out/` served by Tauri directly
- **Backend**: FastAPI bundled as a standalone binary via PyInstaller, registered as a Tauri sidecar
- **Sidecar naming**: Tauri requires `binaries/backend-<target-triple>` (e.g. `backend-aarch64-apple-darwin`)
- **Data directory**: Tauri passes `--app-data-dir <OS_APP_DATA>` to the sidecar; SQLite and uploads live there, not inside the bundle

### Full production build

```bash
# macOS / Linux
chmod +x scripts/build.sh
./scripts/build.sh

# Windows
scripts\build.bat
```

The build scripts:
1. Run PyInstaller on `backend/backend.spec` → `backend/dist/backend`
2. Copy binary to `frontend-tauri/src-tauri/binaries/backend-<triple>`
3. Run `npm run build` in `frontend/` → static export in `frontend/out/`
4. Run `cargo tauri build` → installers in `frontend-tauri/src-tauri/target/release/bundle/`

### Dev workflow

```bash
# Run backend separately
cd backend && uvicorn app.main:app --reload

# Run frontend dev server
cd frontend && npm run dev

# Launch Tauri dev window (points to localhost:3000)
cd frontend-tauri/src-tauri && cargo tauri dev
```

### Prerequisites
- Python 3.11+, Node.js 18+, Rust toolchain (`rustup`)
- Tauri CLI: `cargo install tauri-cli`
- PyInstaller: installed automatically by build scripts

### Mobile (Capacitor)

```bash
cd frontend  # or frontend-capacitor
npx cap add ios && npx cap add android
npx cap run ios
```

## Docker

```bash
docker-compose -f docker/docker-compose.yml up -d
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
```

## Database Init & Seed

```bash
python scripts/init_db.py   # creates schema + seeds default data
python scripts/seed_data.py # generates sample portfolio data (calls get_password_hash)
```

## AI / Ollama Setup

Ollama must be running locally before starting the backend.

```bash
ollama serve
ollama pull llama3   # default model; also supports mistral, deepseek, codellama
```

The `OLLAMA_HOST` config defaults to `http://localhost:11434`. Override via `.env`.

## Environment Variables

Create `backend/.env` (copy from `.env.example`):

```
DATABASE_URL=sqlite:///./finance.db
OLLAMA_HOST=http://localhost:11434
YAHOO_FINANCE_ENABLED=true
ALPHA_VANTAGE_API_KEY=        # optional, free tier available
UPLOAD_DIR=./data/uploads
```

## Market Data

Three-source fallback in `MarketDataService.get_current_price()`:
1. Yahoo Finance (yfinance) — primary, no key needed
2. Alpha Vantage — backup, requires free API key in env
3. Stooq — second backup, no key needed

## Known Gaps / In-Progress

- **Auth not wired**: `create_access_token` in `security.py` is a stub; no login/session flow exists yet
- **Duplicate chart components**: `app/dashboard/` and `components/dashboard/` have overlapping chart implementations
- **Net worth chart uses mock data**: `NetWorthTrendChart` in `components/dashboard/net-worth-chart.tsx` renders hardcoded historical data
- **No test coverage**: `pytest` is in `requirements.txt` but no test files exist yet

## Knowledge Graph

A graphify knowledge graph lives in `graphify-out/`. Open `graphify-out/graph.html` in a browser to explore the codebase visually. Run `/graphify` to rebuild after significant changes.
graphify update ./src

Before making architectural changes, refactoring modules, or modifying cross-file dependencies, read `graphify-out/graph.json` to understand the current module relationships and dependency structure.