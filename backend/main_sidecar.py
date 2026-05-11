"""
Sidecar entry point for Tauri desktop packaging.

Tauri spawns this binary as a subprocess, passing --app-data-dir so the
SQLite database and uploads land in the OS app-data folder rather than
inside the read-only app bundle.

Build with:
    cd backend
    pyinstaller backend.spec --clean
"""

import sys
import os
import argparse


def main() -> None:
    parser = argparse.ArgumentParser(description="Personal Finance Platform Backend")
    parser.add_argument(
        "--app-data-dir",
        default=None,
        help="App-data directory for database and uploaded files",
    )
    parser.add_argument("--port", type=int, default=8000)
    # parse_known_args so Tauri's own injected args don't cause failures
    args, _ = parser.parse_known_args()

    # Set env var BEFORE importing app — config.py reads it at module level
    if args.app_data_dir:
        os.environ["APP_DATA_DIR"] = args.app_data_dir

    # PyInstaller onefile: add the temp extraction dir to sys.path so that
    # the bundled `app` package is importable.
    if getattr(sys, "frozen", False):
        bundle_dir = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
        if bundle_dir not in sys.path:
            sys.path.insert(0, bundle_dir)

        # Fix SSL certificate lookup — requests/yfinance need the CA bundle.
        # PyInstaller strips the path that certifi normally resolves at runtime,
        # so we point SSL_CERT_FILE at the copy we bundled in the spec.
        try:
            import certifi
            cert_file = certifi.where()
            os.environ.setdefault("SSL_CERT_FILE", cert_file)
            os.environ.setdefault("REQUESTS_CA_BUNDLE", cert_file)
        except Exception:
            pass

    import uvicorn
    from app.main import app as fastapi_app  # noqa: PLC0415  (deferred import intentional)

    uvicorn.run(
        fastapi_app,
        host="127.0.0.1",
        port=args.port,
        log_level="warning",
        # Disable reload — sidecar runs as a single process
        reload=False,
    )


if __name__ == "__main__":
    main()
