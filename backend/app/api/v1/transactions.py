"""
Personal Finance Platform - Transactions API
Endpoints for managing transactions
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


class TransactionCreate(BaseModel):
    account_id: int
    holding_id: Optional[int] = None
    transaction_type: str
    transaction_date: date
    settlement_date: Optional[date] = None
    ticker: Optional[str] = None
    shares: float = 0
    price_per_share: float = 0
    total_amount: float = 0
    commission: float = 0
    fees: float = 0
    description: Optional[str] = None
    reference_number: Optional[str] = None


def transaction_to_dict(transaction: models.Transaction) -> dict:
    """Convert Transaction model to dict."""
    return {
        "id": transaction.id,
        "user_id": transaction.user_id,
        "account_id": transaction.account_id,
        "holding_id": transaction.holding_id,
        "transaction_type": transaction.transaction_type,
        "transaction_date": transaction.transaction_date.isoformat() if transaction.transaction_date else None,
        "settlement_date": transaction.settlement_date.isoformat() if transaction.settlement_date else None,
        "ticker": transaction.ticker,
        "shares": float(transaction.shares) if transaction.shares else 0,
        "price_per_share": float(transaction.price_per_share) if transaction.price_per_share else 0,
        "total_amount": float(transaction.total_amount) if transaction.total_amount else 0,
        "commission": float(transaction.commission) if transaction.commission else 0,
        "fees": float(transaction.fees) if transaction.fees else 0,
        "description": transaction.description,
        "reference_number": transaction.reference_number,
        "is_reconciled": transaction.is_reconciled,
        "created_at": transaction.created_at.isoformat() if transaction.created_at else None,
    }


@router.get("/transactions")
async def get_transactions(
    db: Session = Depends(get_db),
    transaction_type: Optional[str] = None,
    account_id: Optional[int] = None,
    holding_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: models.User = Depends(get_current_user),
):
    """Get all transactions with optional filters."""
    query = db.query(models.Transaction).filter(models.Transaction.user_id == current_user.id)

    if transaction_type:
        query = query.filter(models.Transaction.transaction_type == transaction_type)
    if account_id:
        query = query.filter(models.Transaction.account_id == account_id)
    if holding_id:
        query = query.filter(models.Transaction.holding_id == holding_id)
    if start_date:
        query = query.filter(models.Transaction.transaction_date >= start_date)
    if end_date:
        query = query.filter(models.Transaction.transaction_date <= end_date)

    transactions = query.order_by(models.Transaction.transaction_date.desc()).all()

    return {"transactions": [transaction_to_dict(t) for t in transactions], "count": len(transactions)}


@router.get("/transactions/{transaction_id}")
async def get_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get a specific transaction by ID."""
    transaction = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.user_id == current_user.id,
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    return transaction_to_dict(transaction)


@router.post("/transactions")
async def create_transaction(
    body: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a new transaction."""
    valid_types = [
        "buy", "sell", "deposit", "withdrawal", "dividend", "interest",
        "transfer_in", "transfer_out", "split", "spin_off"
    ]
    if body.transaction_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid transaction type. Must be one of: {valid_types}"
        )

    transaction = models.Transaction(
        user_id=current_user.id,
        account_id=body.account_id,
        holding_id=body.holding_id,
        transaction_type=body.transaction_type,
        transaction_date=body.transaction_date,
        settlement_date=body.settlement_date,
        ticker=body.ticker.upper() if body.ticker else None,
        shares=body.shares,
        price_per_share=body.price_per_share,
        total_amount=body.total_amount,
        commission=body.commission,
        fees=body.fees,
        description=body.description,
        reference_number=body.reference_number,
    )

    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    return transaction_to_dict(transaction)


@router.put("/transactions/{transaction_id}")
async def update_transaction(
    transaction_id: int,
    account_id: Optional[int] = None,
    holding_id: Optional[int] = None,
    transaction_type: Optional[str] = None,
    transaction_date: Optional[date] = None,
    settlement_date: Optional[date] = None,
    ticker: Optional[str] = None,
    shares: Optional[float] = None,
    price_per_share: Optional[float] = None,
    total_amount: Optional[float] = None,
    commission: Optional[float] = None,
    fees: Optional[float] = None,
    description: Optional[str] = None,
    reference_number: Optional[str] = None,
    is_reconciled: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update a transaction."""
    transaction = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.user_id == current_user.id,
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Update fields
    if account_id:
        transaction.account_id = account_id
    if holding_id:
        transaction.holding_id = holding_id
    if transaction_type:
        transaction.transaction_type = transaction_type
    if transaction_date:
        transaction.transaction_date = transaction_date
    if settlement_date:
        transaction.settlement_date = settlement_date
    if ticker:
        transaction.ticker = ticker.upper()
    if shares is not None:
        transaction.shares = shares
    if price_per_share is not None:
        transaction.price_per_share = price_per_share
    if total_amount is not None:
        transaction.total_amount = total_amount
    if commission is not None:
        transaction.commission = commission
    if fees is not None:
        transaction.fees = fees
    if description:
        transaction.description = description
    if reference_number:
        transaction.reference_number = reference_number
    if is_reconciled is not None:
        transaction.is_reconciled = 1 if is_reconciled else 0

    db.commit()
    return transaction_to_dict(transaction)


@router.delete("/transactions/{transaction_id}")
async def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a transaction."""
    transaction = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.user_id == current_user.id,
    ).first()

    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    db.delete(transaction)
    db.commit()

    return {"message": "Transaction deleted successfully"}


@router.get("/transactions/summary")
async def get_transaction_summary(
    db: Session = Depends(get_db),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: models.User = Depends(get_current_user),
):
    """Get transaction summary by type and month."""
    query = db.query(models.Transaction).filter(models.Transaction.user_id == current_user.id)

    if start_date:
        query = query.filter(models.Transaction.transaction_date >= start_date)
    if end_date:
        query = query.filter(models.Transaction.transaction_date <= end_date)

    transactions = query.all()

    # Summarize by type
    by_type = {}
    by_month = {}

    for t in transactions:
        # By type
        tx_type = t.transaction_type
        if tx_type not in by_type:
            by_type[tx_type] = {"count": 0, "total_amount": 0}
        by_type[tx_type]["count"] += 1
        by_type[tx_type]["total_amount"] += t.total_amount or 0

        # By month
        month = t.transaction_date.strftime("%Y-%m") if t.transaction_date else "unknown"
        if month not in by_month:
            by_month[month] = {}
        if tx_type not in by_month[month]:
            by_month[month][tx_type] = {"count": 0, "total_amount": 0}
        by_month[month][tx_type]["count"] += 1
        by_month[month][tx_type]["total_amount"] += t.total_amount or 0

    return {
        "by_type": {k: {"count": v["count"], "total_amount": round(v["total_amount"], 2)} for k, v in by_type.items()},
        "by_month": {
            k: {tx: {"count": v2["count"], "total_amount": round(v2["total_amount"], 2)} for tx, v2 in v.items()}
            for k, v in sorted(by_month.items(), reverse=True)
        },
        "total_transactions": len(transactions),
        "total_amount": round(sum(t.total_amount or 0 for t in transactions), 2),
    }
