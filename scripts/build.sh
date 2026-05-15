#!/usr/bin/env bash
# build.sh — Full macOS release build for Finwise
#
# Usage:
#   chmod +x scripts/build.sh && ./scripts/build.sh
#
# Prerequisites:
#   • Python 3.11+   (with pip)
#   • Node.js 18+    (with npm)
#   • Rust toolchain (rustup)
#   • Tauri CLI:     npm install -g @tauri-apps/cli@^2
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BINARY_DIR="$REPO_ROOT/frontend-tauri/src-tauri/binaries"
BUNDLE_DIR="$REPO_ROOT/frontend-tauri/src-tauri/target/release/bundle"
TARGET_TRIPLE="$(rustc -Vv | awk '/^host:/{print $2}')"
MACOS=false
[[ "$(uname)" == "Darwin" ]] && MACOS=true

# Prefer Python 3.13 → 3.12 → 3.11 over the system 3.9 — onedir COLLECT needs
# PyInstaller 6.x which requires Python 3.10+.
PYTHON=python3
for _py in python3.13 python3.12 python3.11; do
    if command -v "$_py" &>/dev/null; then PYTHON="$_py"; break; fi
done
echo "► Python: $PYTHON ($($PYTHON --version))"
echo "► Target: $TARGET_TRIPLE"

# ── 1. Build Python backend (onedir on macOS, onefile on Windows) ──────────────
echo ""
echo "═══════════════════════════════════════"
echo " Step 1 / 3: Build Python backend"
echo "═══════════════════════════════════════"
cd "$REPO_ROOT/backend"
# Remove stale dist/ so PyInstaller can create dist/backend/ as a fresh directory.
rm -rf dist/

# Homebrew / PEP-668 Pythons refuse global pip installs — use a venv instead.
VENV="$REPO_ROOT/backend/.venv"
if [ ! -x "$VENV/bin/python" ]; then
    echo "Creating venv at $VENV ..."
    "$PYTHON" -m venv "$VENV"
fi
VENV_PY="$VENV/bin/python"
"$VENV_PY" -m pip install -q --upgrade pip
"$VENV_PY" -m pip install -q pyinstaller
"$VENV_PY" -m pip install -q -r requirements.txt
"$VENV_PY" -m PyInstaller backend.spec --clean --noconfirm

mkdir -p "$BINARY_DIR"
if $MACOS; then
    # onedir: launcher is dist/backend/backend
    cp "dist/backend/backend" "$BINARY_DIR/backend-${TARGET_TRIPLE}"
    echo "✓ Sidecar launcher → binaries/backend-${TARGET_TRIPLE}"
    echo "✓ _internal/ will be copied into the app bundle after Tauri build"
else
    cp "dist/backend.exe" "$BINARY_DIR/backend-${TARGET_TRIPLE}.exe"
    echo "✓ Sidecar → binaries/backend-${TARGET_TRIPLE}.exe"
fi

# ── 2. Build Next.js frontend ─────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo " Step 2 / 3: Build Next.js frontend"
echo "═══════════════════════════════════════"
cd "$REPO_ROOT/frontend"
npm install
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8000/api/v1}" npm run build
echo "✓ Static export → frontend/out/"

# ── 3. Build Tauri app bundle ─────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo " Step 3 / 3: Build Tauri app + DMG"
echo "═══════════════════════════════════════"
cd "$REPO_ROOT/frontend-tauri/src-tauri"

if command -v tauri &>/dev/null; then
    APPLE_SIGNING_IDENTITY="-" tauri build
elif command -v cargo-tauri &>/dev/null; then
    APPLE_SIGNING_IDENTITY="-" cargo tauri build
else
    echo "Tauri CLI not found — installing..."
    npm install -g @tauri-apps/cli@^2
    APPLE_SIGNING_IDENTITY="-" tauri build
fi

# ── macOS post-build: bundle _internal/, strip Python dylib, sign, make DMG ───
if $MACOS; then
    # Use the productName from tauri.conf.json — avoids picking up stale .app bundles.
    PRODUCT_NAME="$("$PYTHON" -c "import json; print(json.load(open('$REPO_ROOT/frontend-tauri/src-tauri/tauri.conf.json'))['productName'])")"
    APP="$BUNDLE_DIR/macos/$PRODUCT_NAME.app"
    if [ ! -d "$APP" ]; then
        echo "ERROR: Expected app bundle not found: $APP"; exit 1
    fi
    echo ""
    echo "App bundle: $APP"

    # Inside a .app bundle, dyld restricts framework lookup to
    # @executable_path/../Frameworks/ — DYLD_FRAMEWORK_PATH and PyInstaller's
    # own _MEIPASS fallback are ignored. So we copy PyInstaller's entire
    # _internal/ directory directly into Contents/Frameworks/. That makes
    # the flat `Python` symlink land at Contents/Frameworks/Python (where
    # dyld expects it) and keeps base_library.zip + the rest of PyInstaller's
    # support files next to it, so PYTHONHOME calculations stay coherent.
    #
    # We leave the sidecar binary UNSIGNED (as PyInstaller built it). Ad-hoc
    # signing it with Hardened Runtime causes dyld to ignore the framework
    # search path PyInstaller relies on. Plain ad-hoc signing also breaks
    # things on macOS 15; the safest state is no signature at all.
    INTERNAL_SRC="$REPO_ROOT/backend/dist/backend/_internal"
    echo "Copying _internal/ contents into Contents/Frameworks/ ..."
    mkdir -p "$APP/Contents/Frameworks"
    # cp -R preserves symlinks (so Frameworks/Python -> Python.framework/Versions/3.13/Python stays a symlink)
    cp -R "$INTERNAL_SRC"/. "$APP/Contents/Frameworks/"
    echo "✓ $(ls "$APP/Contents/Frameworks/" | wc -l | tr -d ' ') items in Contents/Frameworks/"

    # Re-sign the app bundle to cover the newly added files.
    # --no-strict: PyInstaller adds Python wheel metadata dirs (*.dist-info)
    # that codesign mistakes for malformed bundles. Without --no-strict it
    # exits 1 on the first one and `set -e` aborts the whole script before
    # we get to hdiutil — which is what kept producing a Tauri DMG without
    # our modifications.
    echo "Re-signing app bundle..."
    codesign --force --sign - --no-strict "$APP" 2>&1 | grep -v "bundle format unrecognized" || true

    # CRITICAL: Replace the sidecar with the pristine PyInstaller-built binary
    # AFTER any codesign step. Both Tauri's build and our bundle re-sign mutate
    # the Mach-O (signature + identifier added). `codesign --remove-signature`
    # does NOT restore the original bytes — the bootloader still misbehaves
    # inside a .app bundle. Only the byte-identical original binary works.
    cp "$REPO_ROOT/backend/dist/backend/backend" "$APP/Contents/MacOS/backend"
    echo "✓ Sidecar restored to pristine PyInstaller binary (unsigned)"

    # Sanity check — fail loudly if our modifications didn't land.
    if [ ! -e "$APP/Contents/Frameworks/Python" ]; then
        echo "ERROR: Contents/Frameworks/Python missing — DMG would ship broken"
        ls -la "$APP/Contents/Frameworks/" 2>/dev/null || true
        exit 1
    fi
    FW_COUNT=$(ls "$APP/Contents/Frameworks/" | wc -l | tr -d ' ')
    if [ "$FW_COUNT" -lt 50 ]; then
        echo "ERROR: Contents/Frameworks/ has only $FW_COUNT items (expected ~60+)"
        exit 1
    fi
    echo "✓ Sanity check passed: Contents/Frameworks/Python present, $FW_COUNT items"

    # Create DMG from the modified app bundle.
    VERSION="$("$PYTHON" -c "import json; d=json.load(open('$REPO_ROOT/frontend/package.json')); print(d['version'])")"
    DMG_DIR="$BUNDLE_DIR/dmg"
    mkdir -p "$DMG_DIR"
    DMG_PATH="$DMG_DIR/Finwise_${VERSION}_aarch64.dmg"
    echo "Creating DMG..."
    hdiutil create -volname "Finwise" -srcfolder "$APP" -ov -format UDZO "$DMG_PATH"
    codesign --sign - "$DMG_PATH"
    echo "✓ DMG → $DMG_PATH"
fi

echo ""
echo "══════════════════════════════════════════════"
echo " Build complete!"
if $MACOS; then
    echo " DMG → $BUNDLE_DIR/dmg/"
else
    echo " Installer → $BUNDLE_DIR/"
fi
echo "══════════════════════════════════════════════"
