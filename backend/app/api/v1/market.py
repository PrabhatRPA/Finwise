"""
Personal Finance Platform - Market Data API
Endpoints for market data and price lookups
"""

import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import datetime, timedelta

from app.db import get_db
from app.db import models
from app.services import market_service

router = APIRouter()


@router.get("/market/price/{ticker}")
async def get_market_price(
    ticker: str,
    db: Session = Depends(get_db),
):
    """Get current market price for a ticker."""
    price_data = market_service.get_current_price(ticker.upper())

    if not price_data:
        raise HTTPException(status_code=404, detail=f"No price data found for {ticker.upper()}")

    return price_data


@router.get("/market/history/{ticker}")
async def get_market_history(
    ticker: str,
    period: str = "1y",
    interval: str = "1d",
    db: Session = Depends(get_db),
):
    """Get historical price data for a ticker."""
    df = market_service.get_historical_data(ticker.upper(), period, interval)

    if df is None:
        raise HTTPException(status_code=404, detail=f"No history data found for {ticker.upper()}")

    # Convert DataFrame to dict
    data = {
        "ticker": ticker.upper(),
        "period": period,
        "interval": interval,
        "data": [],
    }

    for timestamp, row in df.iterrows():
        data["data"].append({
            "timestamp": timestamp.isoformat(),
            "open": float(row["Open"]) if not row["Open"].isna() else None,
            "high": float(row["High"]) if not row["High"].isna() else None,
            "low": float(row["Low"]) if not row["Low"].isna() else None,
            "close": float(row["Close"]) if not row["Close"].isna() else None,
            "volume": int(row["Volume"]) if not row["Volume"].isna() else 0,
        })

    return data


@router.post("/market/batch-prices")
async def get_batch_prices(
    tickers: List[str],
):
    """Get current prices for multiple tickers."""
    if not tickers:
        raise HTTPException(status_code=400, detail="No tickers provided")

    prices = market_service.batch_get_prices(tickers)

    return {"prices": prices, "count": len(prices)}


@router.get("/market/search")
async def search_market(
    query: str,
    limit: int = 10,
):
    """Search for stocks by ticker or company name."""
    try:
        # Use yfinance to search
        import yfinance as yf

        results = yf.Ticker(query).history(period="1d")

        if not results.empty:
            ticker = yf.Ticker(query)
            info = ticker.info

            return {
                "results": [{
                    "ticker": query.upper(),
                    "name": info.get("longName", query.upper()),
                    "sector": info.get("sector", "N/A"),
                    "industry": info.get("industry", "N/A"),
                    "current_price": info.get("currentPrice", info.get("regularMarketPrice", 0)),
                    "market_cap": info.get("marketCap", 0),
                }],
                "count": 1,
            }
    except Exception:
        pass

    # If yfinance fails, return empty results
    return {"results": [], "count": 0}


@router.get("/market/suggestions")
async def get_suggestions(
    query: str,
    limit: int = 5,
):
    """Get ticker suggestions based on search query."""
    try:
        import yfinance as yf

        # Get popular ETFs and stocks
        popular_tickers = [
            "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NVDA", "BRK.B",
            "JPM", "V", "JNJ", "PG", "MA", "HD", "DIS", "ADBE", "NFLX", "CRM",
            "INTC", "CSCO", "AMD", "PEP", "COST", "AVGO", "MCD", "SBUX", "NKE",
            "ORCL", "ABT", "TMO", "ACN", "QCOM", "TXN", "CHTR", "CVX", "NEE",
            "LIN", "PYPL", "ADP", "BKNG", "DUK", "SO", "LRCX", "WBD", "GILD",
            "FISV", "ATVI", "ADSK", "KDP", "KKR", "PEAK", "GPS", "HRB", "CAG",
        ]

        # Filter suggestions
        suggestions = [
            t for t in popular_tickers
            if query.upper() in t or len(query) < 2
        ][:limit]

        # Get prices for suggestions
        prices = market_service.batch_get_prices(suggestions)

        return {
            "suggestions": [
                {
                    "ticker": t,
                    "price": prices[t].get("price", 0) if prices.get(t) else 0,
                    "change": prices[t].get("change_percent", 0) if prices.get(t) else 0,
                }
                for t in suggestions
            ],
            "count": len(suggestions),
        }
    except Exception:
        return {"suggestions": [], "count": 0}


@router.get("/market/rate-limits")
async def get_rate_limits():
    """Get current API rate limits for free data sources."""
    return {
        "yahoo_finance": {
            "status": "available",
            "rate_limit": "unlimited (free tier)",
            "description": "Real-time data with caching",
        },
        "alpha_vantage": {
            "status": "available" if os.getenv("ALPHA_VANTAGE_API_KEY") else "not_configured",
            "rate_limit": "25 requests/day (free tier)",
            "description": "Requires API key in environment",
        },
        "stooq": {
            "status": "available",
            "rate_limit": "unlimited (free tier)",
            "description": "Backup data source",
        },
    }


def get_api_key():
    """Get API key from environment or raise error."""
    import os
    key = os.getenv("ALPHA_VANTAGE_API_KEY")
    if not key:
        raise HTTPException(
            status_code=400,
            detail="Alpha Vantage API key not configured. Set ALPHA_VANTAGE_API_KEY environment variable."
        )
    return key
