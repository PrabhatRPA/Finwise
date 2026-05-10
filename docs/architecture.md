# Personal Finance & Investment Portfolio Intelligence Platform
## System Architecture

### Overview
A privacy-first, fully local financial dashboard using free/open-source technologies.

### Technology Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  Next.js Web │  │  Tauri Desktop│  │Capacitor Mobile│  │   CLI Tools  │    │
│  │  (React 18)  │  │   (Tauri 2)  │  │ (React Native) │  │   (Optional) │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API LAYER (FastAPI)                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  RESTful API Endpoints / WebSocket for real-time updates              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                         │
         ┌───────────────────────────────┼───────────────────────────────────┐
         ▼                               ▼                                   ▼
┌───────────────────────┐    ┌───────────────────────┐    ┌───────────────────────────────┐
│   DATABASE LAYER      │    │    AI/LLM LAYER       │    │    EXTERNAL DATA LAYER       │
│                       │    │                       │    │                               │
│  SQLite (Primary)     │    │  Ollama Local LLMs   │    │  Yahoo Finance (yfinance)    │
│  - holdings           │    │  - Llama3             │    │  - Alpha Vantage (backup)    │
│  - accounts           │    │  - Mistral            │    │  - Stooq (backup)            │
│  - transactions       │    │  - DeepSeek           │    │  - Local Cache (DuckDB)      │
│  - bank_accounts      │    │  - CodeLlama          │    │                               │
│  - loans              │    │  - Local Processing   │    │                               │
│  - market_prices      │    │                       │    │                               │
│  - portfolio_history  │    │                       │    │                               │
└───────────────────────┘    └───────────────────────┘    └───────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTRACTORS & ENGINES                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ PDF Parser   │  │ Portfolio    │  │ Market Data  │  │   AI Agent   │    │
│  │ (pdfplumber) │  │ Engine       │  │ Service      │  │   Orchestator│    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Folder Structure
```
personal-finance-platform/
├── docs/                          # Documentation
│   ├── architecture.md           # This file
│   ├── database-schema.md        # Database schema documentation
│   └── api-reference.md          # API endpoint documentation
├── frontend/                      # Next.js Web Application
│   ├── app/                      # Next.js App Router
│   │   ├── (auth)/              # Authentication pages
│   │   ├── (dashboard)/         # Main dashboard routes
│   │   ├── api/                 # API routes
│   │   └── layout.tsx
│   ├── components/               # Reusable components
│   │   ├── ui/                  # ShadCN UI components
│   │   ├── charts/              # Recharts components
│   │   └── forms/               # Form components
│   ├── lib/                     # Utility functions
│   │   ├── api.ts               # API client
│   │   └── utils.ts
│   ├── public/                  # Static assets
│   ├── styles/                  # Global styles
│   └── tailwind.config.ts
├── backend/                       # FastAPI Backend
│   ├── app/
│   │   ├── api/                 # API endpoints
│   │   │   ├── v1/             # API version 1
│   │   │   └── __init__.py
│   │   ├── core/                # Core functionality
│   │   │   ├── config.py        # Configuration
│   │   │   ├── security.py      # Security utilities
│   │   │   └── __init__.py
│   │   ├── db/                  # Database
│   │   │   ├── session.py       # Database session
│   │   │   ├── models.py        # SQLAlchemy models
│   │   │   └── __init__.py
│   │   ├── agents/              # AI Agents
│   │   │   ├── __init__.py
│   │   │   ├── orchestrator.py
│   │   │   └── parsers/
│   │   │       ├── __init__.py
│   │   │       └── pdf_parser.py
│   │   ├── services/            # Business logic
│   │   │   ├── __init__.py
│   │   │   ├── portfolio_engine.py
│   │   │   ├── market_data.py
│   │   │   └── ai_service.py
│   │   ├── models/              # Pydantic models
│   │   │   ├── __init__.py
│   │   │   ├── schemas.py
│   │   │   └── responses.py
│   │   └── main.py              # FastAPI app entry point
│   ├── tests/                   # Test suite
│   ├── requirements.txt
│   └── Dockerfile
├── database/                      # Database files and migrations
│   ├── migrations/              # Alembic migrations
│   ├── schema.sql               # Database schema
│   └── seed_data.sql            # Initial seed data
├── ai/                           # AI/LLM Integration
│   ├── prompts/                 # LLM prompts
│   │   ├── analysis_prompts.py
│   │   ├── extraction_prompts.py
│   │   └── insights_prompts.py
│   ├── ollama_client.py         # Ollama integration
│   └── local_embeddings.py      # Local embeddings
├── agents/                       # Agent definitions
│   ├── __init__.py
│   ├── agent_registry.py
│   └── base_agent.py
├── scripts/                      # Utility scripts
│   ├── init_db.py               # Database initialization
│   ├── seed_data.py             # Seed data generation
│   └── migration_runner.py
├── docker/                       # Docker configuration
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   └── backend.Dockerfile
├── frontend-tauri/               # Tauri Desktop App
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs
│   ├── src-tauri/
│   │   ├── main.rs
│   │   ├── build.rs
│   │   └── Cargo.toml
│   └── tauri.conf.json
├── frontend-mobile/              # Capacitor Mobile App
│   ├── src/
│   ├── capacitor.config.ts
│   └── package.json
├── README.md
├── LICENSE
└── .env.example
```

### Database Schema

See `database/schema.sql` for complete schema.

**Core Tables:**
- `users` - User accounts
- `accounts` - Investment, retirement, and bank accounts
- `holdings` - Stock/ETF holdings
- `transactions` - Trade transactions
- `bank_accounts` - Bank account balances
- `loans` - Liabilities
- `market_prices` - Cached market data
- `portfolio_history` - Historical net worth
- `documents` - Uploaded documents metadata

### AI Agents

1. **System Architect** - Architecture design, folder structure
2. **Backend Engineer** - FastAPI server, API endpoints
3. **Frontend Engineer** - React dashboard, charts, forms
4. **AI Engineer** - Ollama integration, prompts, insights
5. **Document Parsing Agent** - PDF parsing, data extraction
6. **Market Data Agent** - Yahoo Finance integration, caching
7. **Mobile Packaging Agent** - React Native/Capacitor wrapper
8. **Desktop Packaging Agent** - Tauri packaging
9. **DevOps Agent** - Docker, deployment scripts

### Security Considerations

- All data stored locally (SQLite)
- No external cloud services required
- Optional: Local API keys for market data (user-provided)
- HTTPS for external API calls
- Input validation on all endpoints

### Deployment Options

1. **Standalone** - `python -m uvicorn backend.app.main:app`
2. **Docker** - `docker-compose up -d`
3. **Desktop** - `cargo tauri build`
4. **Mobile** - `npx cap run ios/android`
