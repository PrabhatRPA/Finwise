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

echo "► Target: $TARGET_TRIPLE"

# ── 1. Build Python backend (onedir on macOS, onefile on Windows) ──────────────
echo ""
echo "═══════════════════════════════════════"
echo " Step 1 / 3: Build Python backend"
echo "═══════════════════════════════════════"
cd "$REPO_ROOT/backend"
python3 -m pip install -q pyinstaller
python3 -m pip install -q -r requirements.txt
python3 -m PyInstaller backend.spec --clean --noconfirm

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
    APP="$(find "$BUNDLE_DIR/macos" -maxdepth 1 -name "*.app" | head -1)"
    echo ""
    echo "App bundle: $APP"

    # Copy _internal/ next to the sidecar binary inside the bundle.
    # PyInstaller 6.x puts support files in _internal/; older versions put
    # them alongside the binary (we handle both).
    INTERNAL_SRC="$REPO_ROOT/backend/dist/backend/_internal"
    if [ ! -d "$INTERNAL_SRC" ]; then
        # Fallback for PyInstaller < 6.0
        INTERNAL_SRC="$REPO_ROOT/backend/dist/backend"
    fi
    echo "Copying $(basename "$INTERNAL_SRC")/ into Contents/MacOS/ ..."
    cp -r "$INTERNAL_SRC" "$APP/Contents/MacOS/_internal"

    # Strip code signature from the Python dylib inside _internal/.
    # The dylib is now a plain file we own — no sudo required.
    # An unsigned dylib has no Team ID, so macOS loads it freely.
    echo "Stripping Python dylib signature..."
    find "$APP/Contents/MacOS/_internal" \
         -type f \( -name "Python" -o -name "Python3" -o -name "libpython*.dylib" \) \
    | while IFS= read -r dylib; do
        codesign --remove-signature "$dylib" 2>/dev/null \
            && echo "  ✓ stripped: $(basename "$dylib")" \
            || echo "  – already unsigned: $(basename "$dylib")"
    done

    # Sign the sidecar launcher with Hardened Runtime +
    # disable-library-validation as belt-and-suspenders.
    SIDECAR="$(find "$APP/Contents/MacOS" -maxdepth 1 -type f \
                    \( -name "backend" -o -name "backend-*" \) | head -1)"
    cat > /tmp/sidecar.entitlements.plist << 'ENTEOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
</dict>
</plist>
ENTEOF
    echo "Signing sidecar with entitlements..."
    codesign --force --options runtime \
             --entitlements /tmp/sidecar.entitlements.plist \
             --sign - "$SIDECAR"

    # Re-sign the app bundle to cover all the newly added files.
    echo "Re-signing app bundle..."
    codesign --force --sign - "$APP"

    # Create DMG from the modified app bundle.
    VERSION="$(python3 -c "import json; d=json.load(open('$REPO_ROOT/frontend/package.json')); print(d['version'])")"
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
