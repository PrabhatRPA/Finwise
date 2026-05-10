#!/usr/bin/env bash
# ============================================================
# Personal Finance Platform — Start Script
# Starts: Ollama · FastAPI backend · Next.js frontend
# ============================================================
set -euo pipefail

# ── Paths ────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
SCRIPTS="$ROOT/scripts"
DB_FILE="$ROOT/database/finance.db"
LOG_DIR="$ROOT/logs"
PID_FILE="$ROOT/.pids"
ENV_FILE="$BACKEND/.env"

# ── Colours ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
header()  { echo -e "\n${BOLD}$*${NC}"; }

# ── Already running guard ────────────────────────────────────
if [[ -f "$PID_FILE" ]]; then
    warn "Services may already be running (found .pids file)."
    warn "Run ./stop.sh first, or delete .pids if it is stale."
    exit 1
fi

header "═══════════════════════════════════════════════"
header "   Personal Finance Platform — Starting Up"
header "═══════════════════════════════════════════════"

# ── Dependency checks ────────────────────────────────────────
header "1. Checking dependencies…"

PYTHON=""
for py in "$BACKEND/venv/bin/python3" /opt/homebrew/bin/python3.13 /usr/local/bin/python3.13 python3.13 python3; do
    if command -v "$py" &>/dev/null || [[ -x "$py" ]]; then
        PYTHON="$py"; break
    fi
done
[[ -z "$PYTHON" ]] && { error "Python 3 not found."; exit 1; }
success "Python: $PYTHON"

if ! command -v node &>/dev/null; then
    error "Node.js not found. Install from https://nodejs.org"; exit 1
fi
success "Node:   $(node --version)"

if ! command -v ollama &>/dev/null; then
    warn "Ollama not found — AI features will be unavailable."
    OLLAMA_AVAILABLE=false
else
    success "Ollama: $(ollama --version 2>/dev/null || echo 'installed')"
    OLLAMA_AVAILABLE=true
fi

# ── Create log directory ─────────────────────────────────────
mkdir -p "$LOG_DIR"

# ── Create .env if missing ───────────────────────────────────
header "2. Environment…"
if [[ ! -f "$ENV_FILE" ]]; then
    info "Creating $ENV_FILE from defaults…"
    cat > "$ENV_FILE" <<ENVEOF
DATABASE_URL=sqlite:///$ROOT/database/finance.db
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
YAHOO_FINANCE_ENABLED=true
ALPHA_VANTAGE_API_KEY=
UPLOAD_DIR=./data/uploads
APP_ENV=development
DEBUG=false
ENVEOF
    success ".env created — edit backend/.env to customise settings."
else
    success ".env already exists."
fi

# ── Python venv ──────────────────────────────────────────────
header "3. Python virtual environment…"
VENV_PYTHON="$BACKEND/venv/bin/python3"
if [[ ! -x "$VENV_PYTHON" ]]; then
    info "Creating venv with $PYTHON …"
    "$PYTHON" -m venv "$BACKEND/venv"
    success "venv created."
fi

info "Installing/verifying Python packages…"
"$BACKEND/venv/bin/pip" install -q -r "$BACKEND/requirements.txt" \
    --disable-pip-version-check 2>&1 | tail -3
success "Python packages ready."

# ── Node modules ─────────────────────────────────────────────
header "4. Node.js packages…"
if [[ ! -d "$FRONTEND/node_modules" ]]; then
    info "Running npm install…"
    (cd "$FRONTEND" && npm install --silent)
fi
success "Node packages ready."

# ── Database init ────────────────────────────────────────────
header "5. Database…"
if [[ ! -f "$DB_FILE" ]]; then
    info "Initialising database…"
    (cd "$ROOT" && "$BACKEND/venv/bin/python3" "$SCRIPTS/init_db.py" \
        >> "$LOG_DIR/init_db.log" 2>&1)
    success "Database created at database/finance.db"
    info "Seeding sample data…"
    (cd "$ROOT" && "$BACKEND/venv/bin/python3" "$SCRIPTS/seed_data.py" \
        >> "$LOG_DIR/seed_data.log" 2>&1) || warn "Seed failed — check logs/seed_data.log"
    success "Sample data loaded."
else
    success "Database already exists — skipping init."
fi

# ── Ollama ───────────────────────────────────────────────────
header "6. Ollama AI service…"
OLLAMA_PID=""
if [[ "$OLLAMA_AVAILABLE" == true ]]; then
    if curl -sf http://localhost:11434/api/tags &>/dev/null; then
        success "Ollama already running."
    else
        info "Starting Ollama server…"
        ollama serve >> "$LOG_DIR/ollama.log" 2>&1 &
        OLLAMA_PID=$!
        # Wait up to 10 s for Ollama to become ready
        for i in $(seq 1 10); do
            sleep 1
            curl -sf http://localhost:11434/api/tags &>/dev/null && break
            [[ $i -eq 10 ]] && warn "Ollama did not become ready in time — check logs/ollama.log"
        done
        success "Ollama started (pid $OLLAMA_PID)."
    fi
else
    warn "Skipping Ollama — AI analysis features will return errors."
fi

# ── Backend ──────────────────────────────────────────────────
header "7. FastAPI backend (port 8000)…"
(cd "$BACKEND" && \
    "$BACKEND/venv/bin/uvicorn" app.main:app \
        --host 0.0.0.0 --port 8000 \
        --reload \
        >> "$LOG_DIR/backend.log" 2>&1) &
BACKEND_PID=$!

# Wait up to 10 s for backend to answer
for i in $(seq 1 10); do
    sleep 1
    curl -sf http://localhost:8000/health &>/dev/null && break
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        error "Backend process exited — check logs/backend.log"; exit 1
    fi
    [[ $i -eq 10 ]] && { error "Backend did not start in time — check logs/backend.log"; exit 1; }
done
success "Backend running (pid $BACKEND_PID) → http://localhost:8000"

# ── Frontend ─────────────────────────────────────────────────
header "8. Next.js frontend (port 3000)…"
(cd "$FRONTEND" && npm run dev >> "$LOG_DIR/frontend.log" 2>&1) &
FRONTEND_PID=$!

# Wait up to 20 s for frontend to answer
for i in $(seq 1 20); do
    sleep 1
    curl -sf http://localhost:3000 &>/dev/null && break
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        error "Frontend process exited — check logs/frontend.log"; exit 1
    fi
done
success "Frontend running (pid $FRONTEND_PID) → http://localhost:3000"

# ── Save PIDs ────────────────────────────────────────────────
{
    echo "BACKEND_PID=$BACKEND_PID"
    echo "FRONTEND_PID=$FRONTEND_PID"
    [[ -n "$OLLAMA_PID" ]] && echo "OLLAMA_PID=$OLLAMA_PID"
} > "$PID_FILE"

# ── Done ─────────────────────────────────────────────────────
header "═══════════════════════════════════════════════"
echo -e "${GREEN}${BOLD}  All services are up!${NC}"
echo ""
echo -e "  ${BOLD}Dashboard${NC}  →  http://localhost:3000"
echo -e "  ${BOLD}API docs${NC}   →  http://localhost:8000/docs"
echo -e "  ${BOLD}Health${NC}     →  http://localhost:8000/health"
echo ""
echo -e "  Logs:  tail -f logs/backend.log"
echo -e "         tail -f logs/frontend.log"
echo ""
echo -e "  Stop:  ${YELLOW}./stop.sh${NC}"
header "═══════════════════════════════════════════════"

# Open browser (macOS)
if command -v open &>/dev/null; then
    sleep 1 && open http://localhost:3000 &
fi
