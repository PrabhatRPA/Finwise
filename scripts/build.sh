#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────���──────────────
# build.sh — Full macOS / Linux release build for Personal Finance Platform
#
# Usage:
#   chmod +x scripts/build.sh
#   ./scripts/build.sh
#
# Prerequisites:
#   • Python 3.11+   (with pip)
#   • Node.js 18+    (with npm)
#   • Rust toolchain (rustup)
#   • Tauri CLI:  cargo install tauri-cli  OR  npm install -g @tauri-apps/cli
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BINARY_DIR="$REPO_ROOT/frontend-tauri/src-tauri/binaries"

# Detect the current Rust target triple (e.g. aarch64-apple-darwin)
TARGET_TRIPLE="$(rustc -Vv | awk '/^host:/{print $2}')"
echo "► Target triple: $TARGET_TRIPLE"

# ── Step 1: Build the Python backend with PyInstaller ─────────────────────────
echo ""
echo "══════════════════════════���════════════"
echo " Step 1 / 3: Building Python backend"
echo "═══════════════════════════════════════"
cd "$REPO_ROOT/backend"

# Install dependencies (including pyinstaller) into the active environment
pip install -q pyinstaller
pip install -q -r requirements.txt

pyinstaller backend.spec --clean --noconfirm

# Tauri sidecar naming convention: binary-<target-triple>
mkdir -p "$BINARY_DIR"
cp "dist/backend" "$BINARY_DIR/backend-${TARGET_TRIPLE}"
echo "✓ Backend sidecar → binaries/backend-${TARGET_TRIPLE}"

# ── Step 2: Build the Next.js frontend as a static export ─────────────────────
echo ""
echo "═════════════════════════════════���═════"
echo " Step 2 / 3: Building Next.js frontend"
echo "═══════════════════════════════════════"
cd "$REPO_ROOT/frontend"

npm install
# NEXT_PUBLIC_API_URL is baked in at build time; override here if needed.
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8000/api/v1}" npm run build
echo "✓ Static export → frontend/out/"

# ── Step 3: Build the Tauri desktop app ───────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo " Step 3 / 3: Building Tauri app"
echo "═══════════════════════════════════════"
cd "$REPO_ROOT/frontend-tauri"

# Use whichever Tauri CLI is available
if command -v cargo-tauri &>/dev/null; then
    cargo tauri build
elif command -v tauri &>/dev/null; then
    tauri build
else
    # Fall back to running from src-tauri directly via cargo
    cd src-tauri
    cargo build --release
    echo "⚠  Tauri CLI not found — produced raw binary only (no installer)."
    echo "   Install with: cargo install tauri-cli"
fi

echo ""
echo "══════════════════════════════════════════════════════════════"
echo " Build complete!"
echo " Installers → frontend-tauri/src-tauri/target/release/bundle/"
echo "══════════════════════════════════════════════════════════════"
