"""FastAPI dependency for JWT authentication and login rate limiting."""

import time
from collections import defaultdict
from threading import Lock

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.db import get_db
from app.db import models
from app.core.security import decode_access_token

_bearer = HTTPBearer(auto_error=True)

_login_attempts: dict = defaultdict(list)
_lock = Lock()
MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 60


def check_login_rate_limit(ip: str) -> None:
    now = time.time()
    with _lock:
        _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < LOGIN_WINDOW_SECONDS]
        if len(_login_attempts[ip]) >= MAX_LOGIN_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Please try again in a minute.",
            )
        _login_attempts[ip].append(now)


def record_login_success(ip: str) -> None:
    with _lock:
        _login_attempts[ip] = []


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> models.User:
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    user = db.query(models.User).filter(
        models.User.id == int(user_id),
        models.User.is_active == 1,
    ).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
