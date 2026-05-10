"""
Personal Finance Platform - Loans / Debts API
CRUD endpoints for liabilities (mortgages, auto, credit cards, etc.)
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from datetime import date

from app.db import get_db
from app.db import models
from app.core.auth_deps import get_current_user

router = APIRouter()

VALID_LOAN_TYPES = {
    "mortgage", "auto", "student", "credit_card",
    "personal", "business", "home_equity", "line_of_credit", "other",
}
VALID_STATUSES = {"active", "paid_off", "closed", "charged_off"}


class LoanCreate(BaseModel):
    loan_name: str
    loan_type: str
    original_balance: float
    current_balance: float
    interest_rate: Optional[float] = None
    monthly_payment: Optional[float] = None
    lender_name: Optional[str] = None
    due_day: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class LoanUpdate(BaseModel):
    loan_name: Optional[str] = None
    loan_type: Optional[str] = None
    current_balance: Optional[float] = None
    interest_rate: Optional[float] = None
    monthly_payment: Optional[float] = None
    lender_name: Optional[str] = None
    status: Optional[str] = None
    due_day: Optional[int] = None
    end_date: Optional[date] = None


def _loan_to_dict(loan: models.Loan) -> dict:
    return {
        "id": loan.id,
        "user_id": loan.user_id,
        "loan_name": loan.loan_name,
        "loan_type": loan.loan_type,
        "original_balance": float(loan.original_balance or 0),
        "current_balance": float(loan.current_balance or 0),
        "interest_rate": float(loan.interest_rate) if loan.interest_rate else None,
        "monthly_payment": float(loan.monthly_payment) if loan.monthly_payment else None,
        "lender_name": loan.lender_name,
        "due_day": loan.due_day,
        "start_date": loan.start_date.isoformat() if loan.start_date else None,
        "end_date": loan.end_date.isoformat() if loan.end_date else None,
        "status": loan.status,
        "created_at": loan.created_at.isoformat() if loan.created_at else None,
        "updated_at": loan.updated_at.isoformat() if loan.updated_at else None,
    }


@router.get("/loans")
async def list_loans(
    db: Session = Depends(get_db),
    include_paid_off: bool = False,
    current_user: models.User = Depends(get_current_user),
):
    """List all loans/debts for the user."""
    query = db.query(models.Loan).filter(models.Loan.user_id == current_user.id)
    if not include_paid_off:
        query = query.filter(models.Loan.status == "active")
    loans = query.order_by(models.Loan.loan_type, models.Loan.loan_name).all()

    total = sum(l.current_balance or 0 for l in loans)
    return {
        "loans": [_loan_to_dict(l) for l in loans],
        "total_debt": round(total, 2),
        "count": len(loans),
    }


@router.post("/loans")
async def create_loan(
    body: LoanCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Add a new debt/loan."""
    if body.loan_type not in VALID_LOAN_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid loan_type. Choose from: {', '.join(sorted(VALID_LOAN_TYPES))}",
        )

    loan = models.Loan(
        user_id=current_user.id,
        loan_name=body.loan_name,
        loan_type=body.loan_type,
        original_balance=body.original_balance,
        current_balance=body.current_balance,
        interest_rate=body.interest_rate,
        monthly_payment=body.monthly_payment,
        lender_name=body.lender_name,
        due_day=body.due_day,
        start_date=body.start_date,
        end_date=body.end_date,
        status="active",
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return _loan_to_dict(loan)


@router.put("/loans/{loan_id}")
async def update_loan(
    loan_id: int,
    body: LoanUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update a loan's details or balance."""
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.user_id == current_user.id,
    ).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    if body.loan_name is not None:
        loan.loan_name = body.loan_name
    if body.loan_type is not None:
        if body.loan_type not in VALID_LOAN_TYPES:
            raise HTTPException(status_code=400, detail="Invalid loan_type")
        loan.loan_type = body.loan_type
    if body.current_balance is not None:
        loan.current_balance = body.current_balance
    if body.interest_rate is not None:
        loan.interest_rate = body.interest_rate
    if body.monthly_payment is not None:
        loan.monthly_payment = body.monthly_payment
    if body.lender_name is not None:
        loan.lender_name = body.lender_name
    if body.status is not None:
        if body.status not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        loan.status = body.status
    if body.due_day is not None:
        loan.due_day = body.due_day
    if body.end_date is not None:
        loan.end_date = body.end_date

    db.commit()
    db.refresh(loan)
    return _loan_to_dict(loan)


@router.delete("/loans/{loan_id}")
async def delete_loan(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a loan record."""
    loan = db.query(models.Loan).filter(
        models.Loan.id == loan_id,
        models.Loan.user_id == current_user.id,
    ).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")

    db.delete(loan)
    db.commit()
    return {"ok": True, "id": loan_id}
