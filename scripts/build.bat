@echo off
:: ─────────────────────────────────────────────────────────────────────────────
:: build.bat — Full Windows release build for Personal Finance Platform
::
:: Usage (from the repo root):
::   scripts\build.bat
::
:: Prerequisites:
::   • Python 3.11+  (in PATH)
::   • Node.js 18+   (in PATH)
::   • Rust toolchain (rustup)
::   • Tauri CLI:  cargo install tauri-cli  OR  npm install -g @tauri-apps/cli
:: ─────────────────────────────────────────────────────────────────────────────
setlocal enabledelayedexpansion

set REPO_ROOT=%~dp0..
set BINARY_DIR=%REPO_ROOT%\frontend-tauri\src-tauri\binaries

:: Detect Rust target triple
for /f "tokens=2" %%T in ('rustc -Vv ^| findstr /C:"host:"') do set TARGET_TRIPLE=%%T
echo Target triple: %TARGET_TRIPLE%

:: ── Step 1: Build the Python backend with PyInstaller ─────────────────────────
echo.
echo ═══════════════════════════════════════
echo  Step 1 / 3: Building Python backend
echo ═══════════════════════════════════════
cd /d "%REPO_ROOT%\backend"

pip install -q pyinstaller
pip install -q -r requirements.txt

pyinstaller backend.spec --clean --noconfirm
if %ERRORLEVEL% neq 0 (echo PyInstaller failed & exit /b 1)

if not exist "%BINARY_DIR%" mkdir "%BINARY_DIR%"
copy /Y "dist\backend.exe" "%BINARY_DIR%\backend-%TARGET_TRIPLE%.exe"
echo Sidecar -> binaries\backend-%TARGET_TRIPLE%.exe

:: ── Step 2: Build the Next.js frontend as a static export ─────────────────────
echo.
echo ═══════════════════════════════════════
echo  Step 2 / 3: Building Next.js frontend
echo ═══════════════════════════════════════
cd /d "%REPO_ROOT%\frontend"

call npm install
if %ERRORLEVEL% neq 0 (echo npm install failed & exit /b 1)

if "%NEXT_PUBLIC_API_URL%"=="" set NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
call npm run build
if %ERRORLEVEL% neq 0 (echo Next.js build failed & exit /b 1)
echo Static export -> frontend\out\

:: ── Step 3: Build the Tauri desktop app ───────────────────────────────────────
echo.
echo ═══════════════════════════════════════
echo  Step 3 / 3: Building Tauri app
echo ═══════════════════════════════════════
cd /d "%REPO_ROOT%\frontend-tauri"

where cargo-tauri >nul 2>&1
if %ERRORLEVEL%==0 (
    cargo tauri build
) else (
    where tauri >nul 2>&1
    if %ERRORLEVEL%==0 (
        tauri build
    ) else (
        cd src-tauri
        cargo build --release
        echo WARNING: Tauri CLI not found - produced raw binary only.
        echo Install with: cargo install tauri-cli
    )
)
if %ERRORLEVEL% neq 0 (echo Tauri build failed & exit /b 1)

echo.
echo ══════════════════════════════════════════════════════════════
echo  Build complete!
echo  Installers: frontend-tauri\src-tauri\target\release\bundle\
echo ══════════════════════════════════════════════════════════════
endlocal
