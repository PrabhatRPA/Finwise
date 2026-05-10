"""
Personal Finance Platform - Watchlist API
Track stocks with optional price-alert targets.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime

from app.db import get_db
from app.db import models
from app.core.auth_deps import get_current_user
from app.services.market_data import MarketDataService

router = APIRouter()
_market = MarketDataService()

VALID_DIRECTIONS = {"above", "below"}
VALID_NOTIFY_METHODS = {"in_app", "browser", "both"}


class WatchlistCreate(BaseModel):
    ticker: str
    company_name: Optional[str] = None
    target_price: Optional[float] = None
    target_direction: Optional[str] = None  # "above" | "below"
    notification_method: str = "in_app"
    notes: Optional[str] = None


class WatchlistUpdate(BaseModel):
    company_name: Optional[str] = None
    target_price: Optional[float] = None
    target_direction: Optional[str] = None
    notification_method: Optional[str] = None
    notes: Optional[str] = None


def _enrich(item: models.Watchlist, price_data: Optional[dict]) -> dict:
    current_price = price_data.get("price") if price_data else None
    pct_to_target = None
    alert_active = False

    if current_price and item.target_price:
        pct_to_target = round(
            (item.target_price - current_price) / current_price * 100, 2
        )
        if item.target_direction == "above":
            alert_active = current_price >= item.target_price and not item.alert_triggered
        elif item.target_direction == "below":
            alert_active = current_price <= item.target_price and not item.alert_triggered

    return {
        "id": item.id,
        "user_id": item.user_id,
        "ticker": item.ticker,
        "company_name": item.company_name,
        "target_price": item.target_price,
        "target_direction": item.target_direction,
        "notification_method": item.notification_method,
        "notes": item.notes,
        "alert_triggered": item.alert_triggered,
        "last_notified_at": item.last_notified_at.isoformat() if item.last_notified_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        # live-enriched fields
        "current_price": current_price,
        "day_change_percent": price_data.get("change_percent") if price_data else None,
        "pct_to_target": pct_to_target,
        "alert_active": alert_active,
    }


def _fetch_price(ticker: str) -> Optional[dict]:
    try:
        return _market.get_current_price(ticker)
    except Exception:
        return None


@router.get("/watchlist")
def list_watchlist(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return all watchlist items enriched with live prices."""
    items = (
        db.query(models.Watchlist)
        .filter(models.Watchlist.user_id == current_user.id)
        .order_by(models.Watchlist.created_at.desc())
        .all()
    )

    tickers = list({i.ticker.upper() for i in items})
    prices: dict = {}
    for ticker in tickers:
        prices[ticker] = _fetch_price(ticker)

    result = [_enrich(item, prices.get(item.ticker.upper())) for item in items]
    return {"watchlist": result, "count": len(result)}


@router.post("/watchlist", status_code=201)
def create_watchlist_item(
    body: WatchlistCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Add a stock to the watchlist."""
    ticker = body.ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="ticker is required")

    if body.target_direction and body.target_direction not in VALID_DIRECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"target_direction must be one of: {', '.join(VALID_DIRECTIONS)}",
        )
    if body.notification_method not in VALID_NOTIFY_METHODS:
        raise HTTPException(
            status_code=400,
            detail=f"notification_method must be one of: {', '.join(VALID_NOTIFY_METHODS)}",
        )

    existing = db.query(models.Watchlist).filter(
        models.Watchlist.user_id == current_user.id,
        models.Watchlist.ticker == ticker,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"{ticker} is already on your watchlist")

    # Auto-fetch company name if not supplied
    company_name = body.company_name
    price_data = _fetch_price(ticker)
    if not company_name and price_data:
        company_name = price_data.get("company_name") or ticker

    item = models.Watchlist(
        user_id=current_user.id,
        ticker=ticker,
        company_name=company_name or ticker,
        target_price=body.target_price,
        target_direction=body.target_direction,
        notification_method=body.notification_method,
        notes=body.notes,
        alert_triggered=False,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _enrich(item, price_data)


@router.put("/watchlist/{item_id}")
def update_watchlist_item(
    item_id: int,
    body: WatchlistUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Edit a watchlist entry. Editing the target resets the alert_triggered flag."""
    item = db.query(models.Watchlist).filter(
        models.Watchlist.id == item_id,
        models.Watchlist.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")

    target_changed = False

    if body.company_name is not None:
        item.company_name = body.company_name
    if body.target_price is not None:
        item.target_price = body.target_price
        target_changed = True
    if body.target_direction is not None:
        if body.target_direction not in VALID_DIRECTIONS and body.target_direction != "":
            raise HTTPException(status_code=400, detail="Invalid target_direction")
        item.target_direction = body.target_direction or None
        target_changed = True
    if body.notification_method is not None:
        if body.notification_method not in VALID_NOTIFY_METHODS:
            raise HTTPException(status_code=400, detail="Invalid notification_method")
        item.notification_method = body.notification_method
    if body.notes is not None:
        item.notes = body.notes

    if target_changed:
        item.alert_triggered = False

    db.commit()
    db.refresh(item)
    price_data = _fetch_price(item.ticker)
    return _enrich(item, price_data)


@router.delete("/watchlist/{item_id}")
def delete_watchlist_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Remove a stock from the watchlist."""
    item = db.query(models.Watchlist).filter(
        models.Watchlist.id == item_id,
        models.Watchlist.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")

    db.delete(item)
    db.commit()
    return {"ok": True, "id": item_id}


@router.post("/watchlist/{item_id}/acknowledge-alert")
def acknowledge_alert(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Mark an alert as seen — suppresses re-notification until the target is edited."""
    item = db.query(models.Watchlist).filter(
        models.Watchlist.id == item_id,
        models.Watchlist.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")

    item.alert_triggered = True
    item.last_notified_at = datetime.utcnow()
    db.commit()
    return {"ok": True}
