#!/usr/bin/env python3
"""
Initialize the Personal Finance Platform database
"""

import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.core.config import DATABASE_URL, DATABASE_DIR
from app.db import Base, engine
from app.db.models import *  # Import all models


def init_database():
    """Create all database tables."""
    print(f"Initializing database at: {DATABASE_URL}")

    # Ensure database directory exists
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)

    # Create all tables
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)

    print("Database initialized successfully!")
    print(f"Database location: {DATABASE_DIR / 'finance.db'}")


if __name__ == "__main__":
    init_database()
