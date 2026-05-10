"""
Personal Finance Platform - Net Worth API
Endpoints for tracking and analyzing net worth
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import datetime, date, timedelta

from app.db import get_db
from app.db import models
from app.services import portfolio_engine
from app.core.auth_deps import get_current_user

router = APIRouter()


def portfolio_history_to_dict(history: models.PortfolioHistory) -> dict:
    """Convert PortfolioHistory model to dict."""
    return {
        "id": history.id,
        "user_id": history.user_id,
        "history_date": history.history_date.isoformat() if history.history_date else None,
        "total_assets": float(history.total_assets) if history.total_assets else 0,
        "total_liabilities": float(history.total_liabilities) if history.total_liabilities else 0,
        "total_net_worth": float(history.total_net_worth) if history.total_net_worth else 0,
        "total_investments": float(history.total_investments) if history.total_investments else 0,
        "total_cash": float(history.total_cash) if history.total_cash else 0,
        "total_retirement": float(history.total_retirement) if history.total_retirement else 0,
        "total_bank_accounts": float(history.total_bank_accounts) if history.total_bank_accounts else 0,
        "total_stock_value": float(history.total_stock_value) if history.total_stock_value else 0,
        "total_bond_value": float(history.total_bond_value) if history.total_bond_value else 0,
        "total_other_value": float(history.total_other_value) if history.total_other_value else 0,
        "total_ira_value": float(history.total_ira_value) if history.total_ira_value else 0,
        "total_401k_value": float(history.total_401k_value) if history.total_401k_value else 0,
        "total_mortgage": float(history.total_mortgage) if history.total_mortgage else 0,
        "total_loan_value": float(history.total_loan_value) if history.total_loan_value else 0,
        "total_credit_card": float(history.total_credit_card) if history.total_credit_card else 0,
        "created_at": history.created_at.isoformat() if history.created_at else None,
    }


@router.get("/net-worth/current")
async def get_current_net_worth(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get current net worth calculation."""
    accounts = db.query(models.Account).filter(
        models.Account.user_id == current_user.id,
        models.Account.is_active == 1,
    ).all()

    holdings = db.query(models.Holding).filter(
        models.Holding.user_id == current_user.id,
        models.Holding.is_active == 1,
    ).all()

    loans = db.query(models.Loan).filter(
        models.Loan.user_id == current_user.id,
        models.Loan.status == "active",
    ).all()

    properties = db.query(models.Property).filter(
        models.Property.user_id == current_user.id,
        models.Property.is_active == True,
    ).all()

    # Investments = current market value of holdings (stocks/ETFs/etc.)
    total_investments = sum(h.current_value or 0 for h in holdings)

    # Cash = checking, savings, cash management account balances
    cash_account_types = {"checking", "savings", "cash_management"}
    total_cash = sum(a.balance or 0 for a in accounts if a.account_type in cash_account_types)

    # Retirement = IRA / 401k account balances (separate from holdings)
    retirement_types = {"401k", "traditional_ira", "roth_ira"}
    total_retirement = sum(a.balance or 0 for a in accounts if a.account_type in retirement_types)

    # Real estate
    total_real_estate = sum(p.current_value for p in properties)

    # Liabilities
    total_liabilities = sum(l.current_balance or 0 for l in loans)

    total_assets = total_investments + total_cash + total_retirement + total_real_estate
    net_worth = total_assets - total_liabilities

    return {
        "net_worth": round(net_worth, 2),
        "total_assets": round(total_assets, 2),
        "total_liabilities": round(total_liabilities, 2),
        "investments": round(total_investments, 2),
        "cash": round(total_cash, 2),
        "retirement": round(total_retirement, 2),
        "real_estate": round(total_real_estate, 2),
        "property_count": len(properties),
    }


@router.get("/net-worth/history")
async def get_net_worth_history(
    db: Session = Depends(get_db),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: models.User = Depends(get_current_user),
):
    """Get net worth history."""
    query = db.query(models.PortfolioHistory).filter(
        models.PortfolioHistory.user_id == current_user.id
    )

    if start_date:
        query = query.filter(models.PortfolioHistory.history_date >= start_date)
    if end_date:
        query = query.filter(models.PortfolioHistory.history_date <= end_date)

    history = query.order_by(models.PortfolioHistory.history_date.desc()).all()

    return {
        "history": [portfolio_history_to_dict(h) for h in history],
        "count": len(history),
    }


@router.post("/net-worth/history")
async def create_net_worth_record(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a net worth record for today."""
    user_id = current_user.id
    accounts = db.query(models.Account).filter(
        models.Account.user_id == user_id,
        models.Account.is_active == 1,
    ).all()

    holdings = db.query(models.Holding).filter(
        models.Holding.user_id == user_id,
        models.Holding.is_active == 1,
    ).all()

    loans = db.query(models.Loan).filter(
        models.Loan.user_id == user_id,
        models.Loan.status == "active",
    ).all()

    properties = db.query(models.Property).filter(
        models.Property.user_id == user_id,
        models.Property.is_active == True,
    ).all()
    total_real_estate = sum(p.current_value for p in properties)

    # Aggregate by category
    bank_accounts = [a for a in accounts if a.account_type in ["checking", "savings", "cash_management"]]
    investment_accounts = [a for a in accounts if a.account_type in ["brokerage", "traditional_ira", "roth_ira", "401k"]]

    total_bank = sum(a.balance or 0 for a in bank_accounts)
    total_investments = sum(a.balance or 0 for a in investment_accounts) + sum(h.current_value or 0 for h in holdings)
    total_retirement = sum(a.balance or 0 for a in accounts if a.account_type in ["401k", "traditional_ira", "roth_ira"])

    total_liabilities = sum(l.current_balance or 0 for l in loans)

    # Categorize loans
    mortgages = [l for l in loans if l.loan_type == "mortgage"]
    consumer_debt = [l for l in loans if l.loan_type in ["credit_card", "auto", "personal"]]
    other_loans = [l for l in loans if l.loan_type not in ["mortgage", "credit_card", "auto", "personal"]]

    # Upsert: update today's record if it already exists
    record = db.query(models.PortfolioHistory).filter(
        models.PortfolioHistory.user_id == user_id,
        models.PortfolioHistory.history_date == date.today(),
    ).first()
    if record is None:
        record = models.PortfolioHistory(
            user_id=user_id,
            history_date=date.today(),
        )
        db.add(record)

    record.total_assets = total_bank + total_investments + total_retirement + total_real_estate
    record.total_liabilities = total_liabilities
    record.total_net_worth = (total_bank + total_investments + total_retirement + total_real_estate) - total_liabilities
    record.total_investments = total_investments
    record.total_cash = total_bank
    record.total_retirement = total_retirement
    record.total_bank_accounts = total_bank
    record.total_stock_value = sum(h.current_value or 0 for h in holdings if h.security_type == "stock")
    record.total_bond_value = sum(h.current_value or 0 for h in holdings if h.security_type == "bond")
    record.total_other_value = sum(h.current_value or 0 for h in holdings if h.security_type not in ["stock", "bond"])
    record.total_ira_value = sum(a.balance or 0 for a in accounts if a.account_type in ["traditional_ira", "roth_ira"])
    record.total_401k_value = sum(a.balance or 0 for a in accounts if a.account_type == "401k")
    record.total_mortgage = sum(l.current_balance or 0 for l in loans if l.loan_type == "mortgage")
    record.total_loan_value = sum(l.current_balance or 0 for l in [l for l in loans if l.loan_type not in ["mortgage", "credit_card"]])
    record.total_credit_card = sum(l.current_balance or 0 for l in loans if l.loan_type == "credit_card")

    db.commit()
    db.refresh(record)
    return portfolio_history_to_dict(record)




@router.get("/net-worth/trends")
async def get_net_worth_trends(
    db: Session = Depends(get_db),
    days: int = 365,
    current_user: models.User = Depends(get_current_user),
):
    """Get net worth trends over time."""
    start_date = date.today() - timedelta(days=days)

    history = db.query(models.PortfolioHistory).filter(
        models.PortfolioHistory.user_id == current_user.id,
        models.PortfolioHistory.history_date >= start_date,
    ).order_by(models.PortfolioHistory.history_date).all()

    points = []
    for record in history:
        points.append({
            "date": record.history_date.isoformat(),
            "net_worth": float(record.total_net_worth or 0),
            "investments": float(record.total_investments or 0),
            "liabilities": float(record.total_liabilities or 0),
            "assets": float(record.total_assets or 0),
            "cash": float(record.total_cash or 0),
        })

    return {"points": points, "count": len(points)}


@router.get("/net-worth/allocations")
async def get_net_worth_allocations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get asset and liability allocations."""
    accounts = db.query(models.Account).filter(
        models.Account.user_id == current_user.id,
        models.Account.is_active == 1,
    ).all()

    holdings = db.query(models.Holding).filter(
        models.Holding.user_id == current_user.id,
        models.Holding.is_active == 1,
    ).all()

    loans = db.query(models.Loan).filter(
        models.Loan.user_id == current_user.id,
        models.Loan.status == "active",
    ).all()

    # Calculate total values
    total_bank = sum(a.balance or 0 for a in accounts if a.account_type in ["checking", "savings", "cash_management"])
    total_investments = sum(a.balance or 0 for a in accounts if a.account_type in ["brokerage", "traditional_ira", "roth_ira", "401k"])
    total_retirement = sum(a.balance or 0 for a in accounts if a.account_type in ["401k", "traditional_ira", "roth_ira"])

    # Get stock/bond allocations from holdings
    stocks = sum(h.current_value or 0 for h in holdings if h.security_type == "stock")
    bonds = sum(h.current_value or 0 for h in holdings if h.security_type == "bond")
    etfs = sum(h.current_value or 0 for h in holdings if h.security_type == "etf")
    mutual_funds = sum(h.current_value or 0 for h in holdings if h.security_type == "mutual_fund")
    other = sum(h.current_value or 0 for h in holdings if h.security_type not in ["stock", "bond", "etf", "mutual_fund"])

    # Categorize liabilities
    mortgages = sum(l.current_balance or 0 for l in loans if l.loan_type == "mortgage")
    consumer_debt = sum(l.current_balance or 0 for l in loans if l.loan_type in ["credit_card", "auto", "personal"])
    other_loans = sum(l.current_balance or 0 for l in loans if l.loan_type not in ["mortgage", "credit_card", "auto", "personal"])

    total_assets = total_bank + total_investments + total_retirement + stocks + bonds + etfs + mutual_funds + other
    total_liabilities = mortgages + consumer_debt + other_loans

    return {
        "assets": {
            "cash_and_banks": {
                "amount": round(total_bank, 2),
                "percentage": round((total_bank / total_assets * 100) if total_assets else 0, 2),
            },
            "investments": {
                "amount": round(total_investments, 2),
                "percentage": round((total_investments / total_assets * 100) if total_assets else 0, 2),
            },
            "retirement": {
                "amount": round(total_retirement, 2),
                "percentage": round((total_retirement / total_assets * 100) if total_assets else 0, 2),
            },
            "stocks": {
                "amount": round(stocks, 2),
                "percentage": round((stocks / total_assets * 100) if total_assets else 0, 2),
            },
            "bonds": {
                "amount": round(bonds, 2),
                "percentage": round((bonds / total_assets * 100) if total_assets else 0, 2),
            },
            "etfs": {
                "amount": round(etfs, 2),
                "percentage": round((etfs / total_assets * 100) if total_assets else 0, 2),
            },
            "mutual_funds": {
                "amount": round(mutual_funds, 2),
                "percentage": round((mutual_funds / total_assets * 100) if total_assets else 0, 2),
            },
            "other_investments": {
                "amount": round(other, 2),
                "percentage": round((other / total_assets * 100) if total_assets else 0, 2),
            },
        },
        "liabilities": {
            "mortgages": {
                "amount": round(mortgages, 2),
                "percentage": round((mortgages / total_liabilities * 100) if total_liabilities else 0, 2),
            },
            "consumer_debt": {
                "amount": round(consumer_debt, 2),
                "percentage": round((consumer_debt / total_liabilities * 100) if total_liabilities else 0, 2),
            },
            "other_loans": {
                "amount": round(other_loans, 2),
                "percentage": round((other_loans / total_liabilities * 100) if total_liabilities else 0, 2),
            },
        },
        "total_assets": round(total_assets, 2),
        "total_liabilities": round(total_liabilities, 2),
        "net_worth": round(total_assets - total_liabilities, 2),
    }
