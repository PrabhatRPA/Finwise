"""
Personal Finance Platform - Auth API
Registration, login, token refresh, and user info endpoints.
"""

import re
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth_deps import check_login_rate_limit, get_current_user, record_login_success
from app.core.security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_password_hash,
    verify_password,
)
from app.db import get_db
from app.db import models

router = APIRouter()


class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    full_name: Optional[str] = None


@router.get("/auth/check-setup")
async def check_setup(db: Session = Depends(get_db)):
    """Return whether any users exist — used by the frontend for first-run detection."""
    has_users = db.query(models.User).filter(models.User.is_active == 1).first() is not None
    return {"has_users": has_users}


@router.post("/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new local user account and return a JWT token."""
    username = body.username.strip().lower()
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    # Password policy — kept in sync with frontend/lib/password.ts:
    # min 8 chars, at least one uppercase, one lowercase, and one number.
    pw = body.password
    if (
        len(pw) < 8
        or not re.search(r"[A-Z]", pw)
        or not re.search(r"[a-z]", pw)
        or not re.search(r"[0-9]", pw)
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least 8 characters and include an uppercase "
                "letter, a lowercase letter, and a number."
            ),
        )

    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(status_code=409, detail="Username already taken")

    user = models.User(
        username=username,
        email=f"{username}@local",
        password_hash=get_password_hash(body.password),
        full_name=body.full_name,
        is_active=1,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(
        {"sub": str(user.id)},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        full_name=user.full_name,
    )


@router.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Authenticate a user and return a JWT token."""
    client_ip = request.client.host if request.client else "unknown"
    check_login_rate_limit(client_ip)

    username = body.username.strip().lower()
    user = db.query(models.User).filter(
        models.User.username == username,
        models.User.is_active == 1,
    ).first()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    record_login_success(client_ip)
    token = create_access_token(
        {"sub": str(user.id)},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        username=user.username,
        full_name=user.full_name,
    )


@router.get("/auth/me")
async def get_me(current_user: models.User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return {
        "user_id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
    }
