"""
Personal Finance Platform - Accounts API
Endpoints for managing accounts
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date

from app.db import get_db
from app.db import models
from app.core.auth_deps import get_current_user

router = APIRouter()


class BalanceUpdate(BaseModel):
    balance: float


def account_to_dict(account: models.Account) -> dict:
    """Convert Account model to dict."""
    return {
        "id": account.id,
        "user_id": account.user_id,
        "account_name": account.account_name,
        "account_type": account.account_type,
        "account_number": account.account_number,
        "institution_name": account.institution_name,
        "institution_type": account.institution_type,
        "balance": float(account.balance) if account.balance else 0,
        "balance_date": account.balance_date.isoformat() if account.balance_date else None,
        "currency": account.currency,
        "is_active": account.is_active,
        "created_at": account.created_at.isoformat() if account.created_at else None,
        "updated_at": account.updated_at.isoformat() if account.updated_at else None,
    }


@router.get("/accounts")
async def get_accounts(
    db: Session = Depends(get_db),
    account_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: models.User = Depends(get_current_user),
):
    """Get all accounts with optional filters."""
    query = db.query(models.Account).filter(models.Account.user_id == current_user.id)

    if account_type:
        query = query.filter(models.Account.account_type == account_type)
    if is_active is not None:
        query = query.filter(models.Account.is_active == (1 if is_active else 0))

    accounts = query.all()

    return {"accounts": [account_to_dict(a) for a in accounts], "count": len(accounts)}


@router.get("/accounts/{account_id}")
async def get_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get a specific account by ID."""
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == current_user.id,
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    return account_to_dict(account)


@router.post("/accounts")
async def create_account(
    account_name: str = "...",
    account_type: str = "brokerage",
    institution_name: str = None,
    institution_type: str = None,
    balance: float = 0,
    balance_date: date = None,
    currency: str = "USD",
    account_number: str = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a new account."""
    valid_types = [
        "brokerage", "traditional_ira", "roth_ira", "401k",
        "savings", "checking", "cash_management", "hsa",
        "pension", "other"
    ]
    if account_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid account type. Must be one of: {valid_types}"
        )

    account = models.Account(
        user_id=current_user.id,
        account_name=account_name,
        account_type=account_type,
        institution_name=institution_name,
        institution_type=institution_type,
        balance=balance,
        balance_date=balance_date,
        currency=currency,
        account_number=account_number,
    )

    db.add(account)
    db.commit()
    db.refresh(account)

    return account_to_dict(account)


@router.put("/accounts/{account_id}")
async def update_account(
    account_id: int,
    account_name: Optional[str] = None,
    account_type: Optional[str] = None,
    institution_name: Optional[str] = None,
    institution_type: Optional[str] = None,
    balance: Optional[float] = None,
    balance_date: Optional[date] = None,
    currency: Optional[str] = None,
    account_number: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update an account."""
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == current_user.id,
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Update fields
    if account_name:
        account.account_name = account_name
    if account_type:
        account.account_type = account_type
    if institution_name:
        account.institution_name = institution_name
    if institution_type:
        account.institution_type = institution_type
    if balance is not None:
        account.balance = balance
    if balance_date:
        account.balance_date = balance_date
    if currency:
        account.currency = currency
    if account_number:
        account.account_number = account_number
    if is_active is not None:
        account.is_active = 1 if is_active else 0

    db.commit()
    return account_to_dict(account)


@router.patch("/accounts/{account_id}/balance")
async def update_balance(
    account_id: int,
    body: BalanceUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update just the balance of an account."""
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.balance = body.balance
    account.balance_date = datetime.utcnow().date()
    db.commit()
    return account_to_dict(account)


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete an account."""
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == current_user.id,
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    db.delete(account)
    db.commit()

    return {"message": "Account deleted successfully"}


@router.get("/accounts/{account_id}/holdings")
async def get_account_holdings(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get all holdings for a specific account."""
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == current_user.id,
    ).first()

    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    holdings = db.query(models.Holding).filter(
        models.Holding.account_id == account_id,
        models.Holding.user_id == current_user.id,
    ).all()

    return {
        "account": account_to_dict(account),
        "holdings": [holding_to_dict(h) for h in holdings],
        "count": len(holdings),
    }


@router.get("/accounts/balances")
async def get_account_balances(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get summary of all account balances."""
    accounts = db.query(models.Account).filter(
        models.Account.user_id == current_user.id,
        models.Account.is_active == 1,
    ).all()

    total_balance = sum(a.balance or 0 for a in accounts)

    by_type = {}
    for account in accounts:
        acc_type = account.account_type
        if acc_type not in by_type:
            by_type[acc_type] = {"count": 0, "total": 0}
        by_type[acc_type]["count"] += 1
        by_type[acc_type]["total"] += account.balance or 0

    return {
        "total_balance": round(total_balance, 2),
        "accounts_count": len(accounts),
        "by_type": by_type,
    }


def holding_to_dict(holding: models.Holding) -> dict:
    """Convert Holding model to dict."""
    return {
        "id": holding.id,
        "ticker": holding.ticker,
        "shares": float(holding.shares) if holding.shares else 0,
        "average_cost": float(holding.average_cost) if holding.average_cost else 0,
        "current_price": float(holding.current_price) if holding.current_price else 0,
        "current_value": float(holding.current_value) if holding.current_value else 0,
    }
