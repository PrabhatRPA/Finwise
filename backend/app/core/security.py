"""
Personal Finance Platform - Security Utilities
Password hashing, JWT tokens, and authentication
"""

import os
import secrets
import warnings
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError
from passlib.hash import pbkdf2_sha256

SECRET_KEY = os.getenv("SECRET_KEY") or ""
if not SECRET_KEY:
    SECRET_KEY = secrets.token_urlsafe(32)
    warnings.warn(
        "SECRET_KEY not set in environment — tokens will be invalidated on restart. "
        "Add SECRET_KEY=<random-64-char-string> to backend/.env.",
        stacklevel=1,
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Detect legacy bcrypt hashes (start with $2b$, $2a$, $2y$) and verify with bcrypt
    # so users who registered before v1.3.0 can still log in.
    if hashed_password.startswith(("$2b$", "$2a$", "$2y$")):
        try:
            import bcrypt
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception:
            return False
    return pbkdf2_sha256.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    # Pure-Python PBKDF2-SHA256 — no C extension, works on all platforms.
    return pbkdf2_sha256.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def generate_api_key() -> str:
    return f"pf_{secrets.token_urlsafe(32)}"
