"""
Personal Finance Platform - API Package
RESTful API endpoints for all features
"""

import threading
import time
import logging
from contextlib import asynccontextmanager
from datetime import date, timedelta, datetime

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from app.core.config import APP_TITLE, CORS_ORIGINS
from app.db import get_db

logger = logging.getLogger(__name__)


def _save_daily_snapshots():
    """Write a PortfolioHistory row for today for every user whose row is missing or stale."""
    try:
        from app.db import SessionLocal
        from app.db import models
        from app.services.market_data import market_service

        db = SessionLocal()
        try:
            users = db.query(models.User).all()
            today = date.today()
            for user in users:
                existing = db.query(models.PortfolioHistory).filter(
                    models.PortfolioHistory.user_id == user.id,
                    models.PortfolioHistory.history_date == today,
                ).first()
                # Update if record is missing or was last written before current prices loaded
                if existing and existing.created_at:
                    age = datetime.utcnow() - existing.created_at.replace(tzinfo=None)
                    if age < timedelta(minutes=30):
                        continue  # already fresh

                holdings = db.query(models.Holding).filter(
                    models.Holding.user_id == user.id,
                    models.Holding.is_active == 1,
                ).all()
                accounts = db.query(models.Account).filter(
                    models.Account.user_id == user.id,
                    models.Account.is_active == 1,
                ).all()
                loans = db.query(models.Loan).filter(
                    models.Loan.user_id == user.id,
                    models.Loan.status == "active",
                ).all()
                properties = db.query(models.Property).filter(
                    models.Property.user_id == user.id,
                    models.Property.is_active == True,
                ).all()

                total_real_estate = sum(p.current_value for p in properties)
                total_bank = sum(
                    a.balance or 0 for a in accounts
                    if a.account_type in ("checking", "savings", "cash_management")
                )
                total_investments = (
                    sum(a.balance or 0 for a in accounts if a.account_type in ("brokerage", "traditional_ira", "roth_ira", "401k"))
                    + sum(h.current_value or 0 for h in holdings)
                )
                total_retirement = sum(
                    a.balance or 0 for a in accounts
                    if a.account_type in ("401k", "traditional_ira", "roth_ira")
                )
                total_liabilities = sum(l.current_balance or 0 for l in loans)
                total_assets = total_bank + total_investments + total_retirement + total_real_estate

                if existing is None:
                    existing = models.PortfolioHistory(user_id=user.id, history_date=today)
                    db.add(existing)

                existing.total_assets = total_assets
                existing.total_liabilities = total_liabilities
                existing.total_net_worth = total_assets - total_liabilities
                existing.total_investments = total_investments
                existing.total_cash = total_bank
                existing.total_retirement = total_retirement
                existing.total_bank_accounts = total_bank
                existing.total_stock_value = sum(h.current_value or 0 for h in holdings if h.security_type == "stock")
                existing.total_bond_value = sum(h.current_value or 0 for h in holdings if h.security_type == "bond")
                existing.total_other_value = sum(h.current_value or 0 for h in holdings if h.security_type not in ("stock", "bond"))
                existing.total_ira_value = sum(a.balance or 0 for a in accounts if a.account_type in ("traditional_ira", "roth_ira"))
                existing.total_401k_value = sum(a.balance or 0 for a in accounts if a.account_type == "401k")
                existing.total_mortgage = sum(l.current_balance or 0 for l in loans if l.loan_type == "mortgage")
                existing.total_loan_value = sum(l.current_balance or 0 for l in loans if l.loan_type not in ("mortgage", "credit_card"))
                existing.total_credit_card = sum(l.current_balance or 0 for l in loans if l.loan_type == "credit_card")
                existing.created_at = datetime.utcnow()

                db.commit()
                logger.info(f"Daily snapshot saved for user {user.id} ({today})")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error saving daily snapshots: {e}")


def _refresh_prices_for_all_users():
    """Re-fetch current prices for all active holdings and update current_value in DB."""
    try:
        from app.db import SessionLocal
        from app.db import models
        from app.services.market_data import market_service

        db = SessionLocal()
        try:
            holdings = db.query(models.Holding).filter(
                models.Holding.is_active == 1,
            ).all()
            tickers = list({h.ticker for h in holdings if h.ticker})
            if not tickers:
                return
            logger.info(f"Background price refresh for {len(tickers)} tickers…")
            prices = market_service.batch_get_prices(tickers)
            for h in holdings:
                if h.ticker and h.ticker in prices and prices[h.ticker]:
                    p = prices[h.ticker]["price"]
                    h.current_price = p
                    h.current_value = round(h.shares * p, 2) if h.shares else 0
                    if h.average_cost and h.shares:
                        h.total_gain_loss = round(h.current_value - h.shares * h.average_cost, 2)
            db.commit()
            logger.info("Background price refresh complete.")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error in background price refresh: {e}")


def _background_worker(stop_event: threading.Event):
    """
    Background thread: refresh prices every 5 min during market hours,
    every 30 min otherwise. Also saves a daily snapshot after each refresh.
    """
    from app.services.market_data import _us_market_open

    # Initial delay — let the backend finish starting up
    time.sleep(15)

    while not stop_event.is_set():
        try:
            _refresh_prices_for_all_users()
            _save_daily_snapshots()
        except Exception as e:
            logger.error(f"Background worker error: {e}")

        interval = 5 * 60 if _us_market_open() else 30 * 60
        stop_event.wait(interval)


_stop_event = threading.Event()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    _stop_event.clear()
    worker = threading.Thread(target=_background_worker, args=(_stop_event,), daemon=True)
    worker.start()
    yield
    # Shutdown
    _stop_event.set()


# Create main FastAPI app
app = FastAPI(title=APP_TITLE, version="0.1.0", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
from app.api.v1 import holdings, accounts, transactions, documents, market, ai, net_worth, loans, auth, watchlist, data_management, properties

app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(holdings.router, prefix="/api/v1", tags=["holdings"])
app.include_router(accounts.router, prefix="/api/v1", tags=["accounts"])
app.include_router(transactions.router, prefix="/api/v1", tags=["transactions"])
app.include_router(documents.router, prefix="/api/v1", tags=["documents"])
app.include_router(market.router, prefix="/api/v1", tags=["market-data"])
app.include_router(ai.router, prefix="/api/v1", tags=["ai"])
app.include_router(net_worth.router, prefix="/api/v1", tags=["net-worth"])
app.include_router(loans.router, prefix="/api/v1", tags=["loans"])
app.include_router(watchlist.router, prefix="/api/v1", tags=["watchlist"])
app.include_router(data_management.router, prefix="/api/v1", tags=["data-management"])
app.include_router(properties.router, prefix="/api/v1", tags=["properties"])


@app.get("/")
async def root():
    return {
        "name": APP_TITLE,
        "version": "0.1.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/api/v1/refresh-prices")
async def force_refresh_prices(db: Session = Depends(get_db)):
    """Force-expire all cached prices and re-fetch immediately."""
    from app.services.market_data import market_service
    market_service.invalidate_cache()
    threading.Thread(target=_refresh_prices_for_all_users, daemon=True).start()
    threading.Thread(target=_save_daily_snapshots, daemon=True).start()
    return {"status": "refresh started"}


# Mount static files for frontend
try:
    from fastapi.templating import Jinja2Templates
    app.mount("/static", StaticFiles(directory="frontend/dist"), name="static")
    templates = Jinja2Templates(directory="frontend/dist")
except Exception:
    pass
