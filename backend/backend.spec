# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the Personal Finance Platform backend sidecar.
#
# macOS  → --onedir  (dist/backend/backend + dist/backend/_internal/)
#   The Python.framework dylib is a plain file we can strip the code signature
#   from before bundling.  macOS refuses to dlopen a signed dylib whose Team ID
#   differs from the loading process; an unsigned dylib has no Team ID → loads
#   freely.  One-file mode embeds the signed dylib inside the binary making it
#   impossible to strip before runtime extraction.
#
# Windows/Linux → --onefile  (dist/backend.exe / dist/backend)
#   Windows does not enforce Team ID matching so one-file works fine there.

import sys
import certifi as _certifi

_macos = sys.platform == 'darwin'

a = Analysis(
    ["main_sidecar.py"],
    pathex=["."],
    binaries=[],
    datas=[
        ("app", "app"),
        (_certifi.where(), "certifi"),
    ],
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.http.httptools_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "uvicorn.middleware",
        "uvicorn.middleware.proxy_headers",
        "uvicorn._types",
        "sqlalchemy.dialects.sqlite",
        "sqlalchemy.dialects.sqlite.pysqlite",
        "sqlalchemy.orm",
        "sqlalchemy.event",
        "sqlalchemy.pool",
        "starlette.routing",
        "starlette.middleware",
        "starlette.staticfiles",
        "starlette.templating",
        "multipart",
        "python_multipart",
        "aiofiles",
        "passlib",
        "passlib.handlers.pbkdf2",
        "passlib.utils.pbkdf2",
        "jose",
        "jose.jwt",
        "yfinance",
        "pandas",
        "pandas._libs.tslibs.np_datetime",
        "numpy",
        "numpy.core._dtype_ctypes",
        "anthropic",
        "openai",
        "httpx",
        "httpx._transports",
        "httpx._transports.default",
        "pydantic",
        "pydantic_core",
        "pydantic.deprecated",
        "anyio",
        "anyio._backends._asyncio",
        "anyio._backends._trio",
        "certifi",
        "zoneinfo",
        "dotenv",
        "email.mime.text",
        "email.mime.multipart",
        "charset_normalizer",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "scipy", "IPython", "jupyter"],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    # macOS onedir: EXE produces only the launcher; COLLECT assembles _internal/.
    # Windows/Linux onefile: EXE embeds everything in the single executable.
    [] if _macos else a.binaries,
    [] if _macos else a.datas,
    [],
    exclude_binaries=_macos,
    name="backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# macOS only: collect all support files into dist/backend/_internal/
# The launcher (dist/backend/backend) and _internal/ sit side-by-side;
# we copy both into Contents/MacOS/ of the app bundle after the Tauri build.
if _macos:
    coll = COLLECT(
        exe,
        a.binaries,
        a.datas,
        strip=False,
        upx=False,
        name="backend",
    )
