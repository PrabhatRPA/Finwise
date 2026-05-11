"""
Personal Finance Platform - Holdings API
Endpoints for managing investment holdings
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date

logger = logging.getLogger(__name__)

from app.db import get_db
from app.db import models
from app.services import portfolio_engine, market_service
from app.ai import agent
from app.core import security
from app.core.auth_deps import get_current_user

router = APIRouter()


# Pydantic schemas
class HoldingCreate(BaseModel):
    account_id: Optional[int] = None
    ticker: str
    shares: float
    average_cost: float = 0
    security_type: str = "stock"
    purchase_date: Optional[date] = None
    security_name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None


class HoldingResponse(BaseModel):
    id: int
    account_id: Optional[int] = None
    user_id: int
    ticker: str
    security_name: Optional[str] = None
    security_type: Optional[str] = None
    shares: float
    average_cost: float
    purchase_date: Optional[date] = None
    current_price: float
    current_value: float
    total_gain_loss: float
    total_gain_loss_percent: float
    dividend_yield: float
    sector: Optional[str] = None
    industry: Optional[str] = None
    is_active: int
    last_updated: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


def holding_to_dict(holding: models.Holding) -> dict:
    """Convert Holding model to dict."""
    return {
        "id": holding.id,
        "account_id": holding.account_id,
        "user_id": holding.user_id,
        "ticker": holding.ticker,
        "security_name": holding.security_name,
        "security_type": holding.security_type,
        "shares": float(holding.shares) if holding.shares else 0,
        "average_cost": float(holding.average_cost) if holding.average_cost else 0,
        "purchase_date": holding.purchase_date.isoformat() if holding.purchase_date else None,
        "current_price": float(holding.current_price) if holding.current_price else 0,
        "current_value": float(holding.current_value) if holding.current_value else 0,
        "total_gain_loss": float(holding.total_gain_loss) if holding.total_gain_loss else 0,
        "total_gain_loss_percent": float(holding.total_gain_loss_percent) if holding.total_gain_loss_percent else 0,
        "today_gain_loss": 0.0,
        "today_gain_loss_percent": 0.0,
        "dividend_yield": float(holding.dividend_yield) if holding.dividend_yield else 0,
        "sector": holding.sector,
        "industry": holding.industry,
        "is_active": holding.is_active,
        "last_updated": holding.last_updated.isoformat() if holding.last_updated else None,
        "created_at": holding.created_at.isoformat() if holding.created_at else None,
    }


@router.get("/holdings")
async def get_holdings(
    db: Session = Depends(get_db),
    ticker: Optional[str] = None,
    account_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user),
):
    """Get all holdings with optional filters."""
    query = db.query(models.Holding).filter(models.Holding.user_id == current_user.id)

    if ticker:
        query = query.filter(models.Holding.ticker == ticker.upper())
    if account_id:
        query = query.filter(models.Holding.account_id == account_id)

    holdings = query.all()

    # Update prices
    tickers = list(set(h.ticker for h in holdings if h.ticker))
    prices = market_service.batch_get_prices(tickers)

    result = []
    for h in holdings:
        data = holding_to_dict(h)
        if h.ticker and h.ticker in prices:
            price = prices[h.ticker]
            if price:
                current_price = price.get("price", 0)
                prev_close = price.get("previous_close", 0) or 0
                shares = data["shares"]
                avg_cost = data["average_cost"]

                data["current_price"] = current_price
                data["current_value"] = round(shares * current_price, 2)
                data["total_gain_loss"] = round(
                    data["current_value"] - (shares * avg_cost), 2
                )
                if avg_cost:
                    data["total_gain_loss_percent"] = round(
                        (data["total_gain_loss"] / (shares * avg_cost)) * 100, 2
                    )

                # Today's gain/loss (vs. previous close)
                if prev_close > 0:
                    today_price_change = current_price - prev_close
                    data["today_gain_loss"] = round(today_price_change * shares, 2)
                    data["today_gain_loss_percent"] = round(
                        (today_price_change / prev_close) * 100, 2
                    )

                # Update database with latest price
                h.current_price = current_price
                h.current_value = data["current_value"]
                h.total_gain_loss = data["total_gain_loss"]
                h.total_gain_loss_percent = data["total_gain_loss_percent"]
                h.last_updated = datetime.utcnow()
        result.append(data)

    db.commit()
    return {"holdings": result, "count": len(result)}


@router.get("/holdings/{holding_id}")
async def get_holding(
    holding_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get a specific holding by ID."""
    holding = db.query(models.Holding).filter(
        models.Holding.id == holding_id,
        models.Holding.user_id == current_user.id,
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    data = holding_to_dict(holding)
    prices = market_service.batch_get_prices([holding.ticker])

    if holding.ticker and holding.ticker in prices:
        price = prices[holding.ticker]
        if price:
            current_price = price.get("price", 0)
            data["current_price"] = current_price
            data["current_value"] = round(data["shares"] * current_price, 2)
            data["total_gain_loss"] = round(
                data["current_value"] - (data["shares"] * data["average_cost"]), 2
            )
            if data["average_cost"]:
                data["total_gain_loss_percent"] = round(
                    (data["total_gain_loss"] / (data["shares"] * data["average_cost"])) * 100, 2
                )

    return data


@router.post("/holdings")
async def create_holding(
    holding_data: HoldingCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a new holding."""
    user_id = current_user.id
    # Validate account only when one is specified
    if holding_data.account_id is not None:
        account = db.query(models.Account).filter(
            models.Account.id == holding_data.account_id,
            models.Account.user_id == user_id,
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")

    ticker = holding_data.ticker.upper()

    # Fetch current price before saving so the record is immediately populated
    price_data = None
    try:
        price_data = market_service.get_current_price(ticker)
    except Exception as e:
        logger.warning(f"Could not fetch price for {ticker} on create: {e}")

    current_price = price_data.get("price", 0) if price_data else 0
    current_value = round(holding_data.shares * current_price, 2) if current_price else 0
    cost_basis = holding_data.shares * holding_data.average_cost if holding_data.average_cost else 0
    total_gain_loss = round(current_value - cost_basis, 2) if current_price else 0
    total_gain_loss_pct = round((total_gain_loss / cost_basis) * 100, 2) if cost_basis else 0

    holding = models.Holding(
        account_id=holding_data.account_id,
        user_id=user_id,
        ticker=ticker,
        security_name=holding_data.security_name or (price_data.get("company_name") if price_data else None),
        security_type=holding_data.security_type,
        shares=holding_data.shares,
        average_cost=holding_data.average_cost,
        purchase_date=holding_data.purchase_date,
        sector=holding_data.sector or (price_data.get("sector") if price_data else None),
        industry=holding_data.industry or (price_data.get("industry") if price_data else None),
        current_price=current_price or None,
        current_value=current_value or None,
        dividend_yield=price_data.get("dividend_yield") if price_data else None,
        total_gain_loss=total_gain_loss or None,
        total_gain_loss_percent=total_gain_loss_pct or None,
        last_updated=datetime.utcnow() if current_price else None,
    )

    db.add(holding)
    db.commit()
    db.refresh(holding)

    return holding_to_dict(holding)


@router.put("/holdings/{holding_id}")
async def update_holding(
    holding_id: int,
    holding_data: HoldingCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update a holding."""
    holding = db.query(models.Holding).filter(
        models.Holding.id == holding_id,
        models.Holding.user_id == current_user.id,
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    # Update fields
    holding.account_id = holding_data.account_id
    holding.ticker = holding_data.ticker.upper()
    holding.shares = holding_data.shares
    holding.average_cost = holding_data.average_cost
    holding.security_type = holding_data.security_type
    holding.purchase_date = holding_data.purchase_date
    holding.security_name = holding_data.security_name
    holding.sector = holding_data.sector
    holding.industry = holding_data.industry

    db.commit()
    return holding_to_dict(holding)


@router.delete("/holdings/{holding_id}")
async def delete_holding(
    holding_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a holding."""
    holding = db.query(models.Holding).filter(
        models.Holding.id == holding_id,
        models.Holding.user_id == current_user.id,
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    db.delete(holding)
    db.commit()

    return {"message": "Holding deleted successfully"}


@router.get("/holdings/analysis/{ticker}")
async def analyze_holding(
    ticker: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get AI analysis for a specific holding."""
    holding = db.query(models.Holding).filter(
        models.Holding.ticker == ticker.upper(),
        models.Holding.user_id == current_user.id,
    ).first()

    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    # Get price data
    price_data = market_service.get_current_price(ticker.upper())

    # Get AI analysis
    analysis_agent = agent.StockAnalysisAgent()
    analysis = analysis_agent.analyze_stock(
        ticker=ticker.upper(),
        company_name=price_data.get("company_name") if price_data else None,
        price_data=price_data,
    )

    return {
        "holding": holding_to_dict(holding),
        "analysis": analysis,
    }


@router.get("/holdings/portfolio-summary")
async def get_portfolio_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get a comprehensive portfolio summary."""
    holdings = db.query(models.Holding).filter(
        models.Holding.user_id == current_user.id,
        models.Holding.is_active == 1,
    ).all()

    if not holdings:
        return {"summary": {}}

    # Get prices
    tickers = list(set(h.ticker for h in holdings if h.ticker))
    prices = market_service.batch_get_prices(tickers)

    # Update holdings with current prices
    for h in holdings:
        if h.ticker and h.ticker in prices and prices[h.ticker]:
            price = prices[h.ticker]
            if price:
                current_price = price.get("price", 0)
                h.current_price = current_price
                h.current_value = h.shares * current_price if h.shares else 0
                h.total_gain_loss = h.current_value - (h.shares * h.average_cost) if h.average_cost else 0
                if h.average_cost and h.shares:
                    h.total_gain_loss_percent = (h.total_gain_loss / (h.shares * h.average_cost)) * 100

    db.commit()

    # Convert to list
    holdings_list = [holding_to_dict(h) for h in holdings]

    # Calculate portfolio metrics
    portfolio_summary = portfolio_engine.calculate_weighted_cost_basis(holdings_list)
    allocation = portfolio_engine.calculate_asset_allocation(holdings_list)
    performance = portfolio_engine.calculate_portfolio_performance(holdings_list)
    health = portfolio_engine.calculate_portfolio_health(holdings_list)

    return {
        "summary": {
            "weighted_cost_basis": portfolio_summary,
            "asset_allocation": allocation,
            "portfolio_performance": performance,
            "portfolio_health": health,
            "holdings_count": len(holdings),
        }
    }


@router.post("/holdings/batch")
async def batch_add_holdings(
    holdings_data: List[HoldingCreate],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Add multiple holdings at once."""
    created = []
    user_id = current_user.id

    for holding_data in holdings_data:
        # Check account exists
        account = db.query(models.Account).filter(
            models.Account.id == holding_data.account_id,
            models.Account.user_id == user_id,
        ).first()

        if not account:
            continue

        # Create holding
        holding = models.Holding(
            account_id=holding_data.account_id,
            user_id=user_id,
            ticker=holding_data.ticker.upper(),
            security_name=holding_data.security_name,
            security_type=holding_data.security_type,
            shares=holding_data.shares,
            average_cost=holding_data.average_cost,
            purchase_date=holding_data.purchase_date,
            sector=holding_data.sector,
            industry=holding_data.industry,
        )

        db.add(holding)
        db.commit()
        db.refresh(holding)

        created.append(holding_to_dict(holding))

    return {"created": created, "count": len(created)}
