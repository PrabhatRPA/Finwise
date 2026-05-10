#!/usr/bin/env bash
# ============================================================
# Personal Finance Platform — Stop Script
# Gracefully shuts down backend, frontend, and (optionally) Ollama
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT/.pids"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }

stop_pid() {
    local name="$1" pid="$2"
    if [[ -z "$pid" ]]; then
        warn "$name: no PID recorded — skipping."
        return
    fi
    if kill -0 "$pid" 2>/dev/null; then
        info "Stopping $name (pid $pid)…"
        kill -TERM "$pid" 2>/dev/null || true
        # Give it up to 5 s to exit gracefully, then force-kill
        for i in $(seq 1 5); do
            sleep 1
            kill -0 "$pid" 2>/dev/null || { success "$name stopped."; return; }
        done
        warn "$name did not stop gracefully — sending SIGKILL…"
        kill -KILL "$pid" 2>/dev/null || true
        success "$name force-killed."
    else
        warn "$name (pid $pid) was not running."
    fi
}

echo -e "\n${BOLD}Personal Finance Platform — Shutting Down${NC}\n"

# ── Read PIDs ─────────────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""
OLLAMA_PID=""

if [[ -f "$PID_FILE" ]]; then
    # shellcheck source=/dev/null
    source "$PID_FILE"
else
    warn ".pids file not found — attempting port-based cleanup instead."
fi

# ── Stop services ─────────────────────────────────────────────
stop_pid "FastAPI backend"  "${BACKEND_PID:-}"
stop_pid "Next.js frontend" "${FRONTEND_PID:-}"

# Only stop Ollama if we started it (it has a recorded PID)
if [[ -n "${OLLAMA_PID:-}" ]]; then
    stop_pid "Ollama" "$OLLAMA_PID"
else
    info "Ollama was not started by this script — leaving it running."
fi

# ── Port-based fallback cleanup ───────────────────────────────
# Kill any process still holding ports 8000 or 3000, in case PIDs drifted.
for port in 8000 3000; do
    pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    if [[ -n "$pid" ]]; then
        warn "Port $port still occupied by pid $pid — force-killing…"
        kill -KILL $pid 2>/dev/null || true
        success "Port $port cleared."
    fi
done

# ── Clean up PID file ─────────────────────────────────────────
rm -f "$PID_FILE"
success "Removed .pids file."

echo -e "\n${GREEN}${BOLD}All services stopped.${NC}\n"
