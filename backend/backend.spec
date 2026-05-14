# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the Personal Finance Platform backend sidecar.
#
# Run from the backend/ directory:
#   pyinstaller backend.spec --clean
#
# Output: dist/backend  (dist/backend.exe on Windows)

import certifi as _certifi

a = Analysis(
    ["main_sidecar.py"],
    pathex=["."],
    binaries=[],
    datas=[
        # Bundle the entire app package so all modules are available
        ("app", "app"),
        # Bundle CA certificates so requests/yfinance can verify HTTPS in the frozen binary
        (_certifi.where(), "certifi"),
    ],
    hiddenimports=[
        # uvicorn internals that are loaded dynamically
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
        # SQLAlchemy SQLite dialect
        "sqlalchemy.dialects.sqlite",
        "sqlalchemy.dialects.sqlite.pysqlite",
        "sqlalchemy.orm",
        "sqlalchemy.event",
        "sqlalchemy.pool",
        # FastAPI / Starlette internals
        "starlette.routing",
        "starlette.middleware",
        "starlette.staticfiles",
        "starlette.templating",
        # File uploads
        "multipart",
        "python_multipart",
        "aiofiles",
        # Auth utilities — pbkdf2_sha256 is pure Python, no C extension needed
        "passlib",
        "passlib.handlers.pbkdf2",
        "passlib.utils.pbkdf2",
        "jose",
        "jose.jwt",
        # Market data
        "yfinance",
        "pandas",
        "pandas._libs.tslibs.np_datetime",
        "numpy",
        "numpy.core._dtype_ctypes",
        # AI providers
        "anthropic",
        "openai",
        "httpx",
        "httpx._transports",
        "httpx._transports.default",
        # Pydantic
        "pydantic",
        "pydantic_core",
        "pydantic.deprecated",
        # Async
        "anyio",
        "anyio._backends._asyncio",
        "anyio._backends._trio",
        # SSL / timezone
        "certifi",
        "zoneinfo",
        # Misc
        "dotenv",
        "email.mime.text",
        "email.mime.multipart",
        "charset_normalizer",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # Exclude heavy packages not needed at runtime
    excludes=["tkinter", "matplotlib", "scipy", "IPython", "jupyter"],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    # UPX can corrupt some Python C-extensions — leave disabled
    upx=False,
    runtime_tmpdir=None,
    # console=True keeps the process alive without a visible window on macOS/Linux;
    # on Windows release builds Tauri hides the console via its own manifest.
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
