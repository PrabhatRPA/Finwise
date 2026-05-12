"""
Personal Finance Platform - Market Data Service
Fetches and caches stock market data using free APIs
"""

import os
import json
import logging
from datetime import datetime, timedelta, time as _time
from typing import Optional, Dict, List, Any
from pathlib import Path

import yfinance as yf
import pandas as pd
import numpy as np

from app.core.config import (
    YAHOO_FINANCE_ENABLED,
    ALPHA_VANTAGE_API_KEY,
    STOOQ_ENABLED,
    DATABASE_DIR,
)

logger = logging.getLogger(__name__)


def _us_market_open() -> bool:
    """Returns True if the US stock market is currently open (9:30–16:00 ET, Mon–Fri)."""
    try:
        from zoneinfo import ZoneInfo
        now_et = datetime.now(ZoneInfo("America/New_York"))
    except ImportError:
        # Python < 3.9 fallback: approximate ET as UTC-4 (EDT)
        now_et = datetime.utcnow() - timedelta(hours=4)

    if now_et.weekday() >= 5:  # Saturday=5, Sunday=6
        return False

    market_open = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
    market_close = now_et.replace(hour=16, minute=0, second=0, microsecond=0)
    # Strip tzinfo for comparison if fallback path used naive datetime
    t = now_et.replace(tzinfo=None) if now_et.tzinfo is None else now_et
    o = market_open.replace(tzinfo=None) if market_open.tzinfo is None else market_open
    c = market_close.replace(tzinfo=None) if market_close.tzinfo is None else market_close
    return o <= t <= c


class MarketDataService:
    """Service for fetching and caching market data."""

    def __init__(self):
        self.cache_dir = DATABASE_DIR / "market_data_cache"
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Cache in-memory for performance
        self._price_cache: Dict[str, Dict] = {}
        self._history_cache: Dict[str, pd.DataFrame] = {}

    def get_current_price(self, ticker: str) -> Optional[Dict[str, Any]]:
        """
        Get the current price for a ticker.

        Args:
            ticker: Stock ticker symbol

        Returns:
            Dictionary with price data or None if not found
        """
        ticker = ticker.upper()
        ttl = timedelta(minutes=5) if _us_market_open() else timedelta(hours=4)

        # Check in-memory cache — enforce same TTL as file cache
        if ticker in self._price_cache:
            cached = self._price_cache[ticker]
            if cached and cached.get("price", 0) > 0:
                cache_time = datetime.fromisoformat(cached.get("timestamp", "1970-01-01"))
                if datetime.now() - cache_time < ttl:
                    return cached
            del self._price_cache[ticker]  # expired or zero-price

        # Check file cache
        cache_file = self.cache_dir / f"{ticker}.json"
        if cache_file.exists():
            try:
                with open(cache_file, "r") as f:
                    cached = json.load(f)
                    cache_time = datetime.fromisoformat(cached.get("timestamp", "1970-01-01"))
                    if datetime.now() - cache_time < ttl:
                        logger.info(f"Using cached price for {ticker}")
                        self._price_cache[ticker] = cached
                        return cached
            except Exception as e:
                logger.error(f"Error reading cache for {ticker}: {e}")

        # Fetch from API
        price_data = None

        if YAHOO_FINANCE_ENABLED:
            price_data = self._fetch_yahoo_finance(ticker)

        # Try backup sources if needed
        if not price_data:
            if ALPHA_VANTAGE_API_KEY:
                price_data = self._fetch_alpha_vantage(ticker)
            elif STOOQ_ENABLED:
                price_data = self._fetch_stooq(ticker)

        if price_data:
            # Update cache
            price_data["timestamp"] = datetime.now().isoformat()
            self._price_cache[ticker] = price_data

            # Save to file cache
            try:
                with open(cache_file, "w") as f:
                    json.dump(price_data, f)
            except Exception as e:
                logger.error(f"Error writing cache for {ticker}: {e}")

        return price_data

    def get_historical_data(
        self,
        ticker: str,
        period: str = "1y",
        interval: str = "1d",
    ) -> Optional[pd.DataFrame]:
        """
        Get historical price data for a ticker.

        Args:
            ticker: Stock ticker symbol
            period: Data period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)
            interval: Data interval (1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1mo, 3mo)

        Returns:
            DataFrame with historical data
        """
        ticker = ticker.upper()
        cache_key = f"{ticker}_{period}_{interval}"

        # Check in-memory cache
        if cache_key in self._history_cache:
            return self._history_cache[cache_key]

        # Check file cache — re-fetch after 4 h during market hours, 20 h otherwise
        cache_file = self.cache_dir / f"{cache_key}.csv"
        if cache_file.exists():
            try:
                hist_ttl = timedelta(hours=4) if _us_market_open() else timedelta(hours=20)
                mtime = datetime.fromtimestamp(cache_file.stat().st_mtime)
                if datetime.now() - mtime < hist_ttl:
                    df = pd.read_csv(cache_file, index_col=0, parse_dates=True)
                    logger.info(f"Using cached history for {ticker}")
                    self._history_cache[cache_key] = df
                    return df
            except Exception as e:
                logger.error(f"Error reading history cache for {ticker}: {e}")

        # Fetch from API
        df = None

        if YAHOO_FINANCE_ENABLED:
            df = self._fetch_yahoo_history(ticker, period, interval)

        if df is not None:
            # Update cache
            self._history_cache[cache_key] = df

            # Save to file cache
            try:
                df.to_csv(cache_file)
            except Exception as e:
                logger.error(f"Error writing history cache for {ticker}: {e}")

        return df

    def _fetch_yahoo_finance(self, ticker: str) -> Optional[Dict[str, Any]]:
        """
        Fetch current (or last available) price from Yahoo Finance.
        Works during and outside market hours — always returns the most recent close.
        Strategy: fast_info → history(5d) → info fallback.
        """
        try:
            stock = yf.Ticker(ticker)
            price = None

            # 1. fast_info — lightweight, works in and out of market hours
            try:
                fi = stock.fast_info
                for attr in ("last_price", "lastPrice", "regular_market_price"):
                    val = getattr(fi, attr, None)
                    if val and float(val) > 0:
                        price = float(val)
                        break
                # If market is closed, last_price may be 0; fall back to previous close
                if not price or price <= 0:
                    pc = getattr(fi, "previous_close", None) or getattr(fi, "previousClose", None)
                    if pc and float(pc) > 0:
                        price = float(pc)
            except Exception:
                pass

            # 2. Recent history — most reliable across all market conditions
            if not price or price <= 0:
                try:
                    hist = stock.history(period="5d", auto_adjust=True)
                    if not hist.empty:
                        price = float(hist["Close"].iloc[-1])
                except Exception:
                    pass

            if not price or price <= 0:
                logger.warning(f"No price found for {ticker} via Yahoo Finance")
                return None

            result: Dict[str, Any] = {
                "ticker": ticker,
                "price": price,
                "previous_close": 0,
                "open": 0,
                "high": 0,
                "low": 0,
                "volume": 0,
                "market_cap": 0,
                "company_name": ticker,
                "sector": "",
                "industry": "",
                "pe_ratio": 0,
                "dividend_yield": 0,
                "source": "yahoo_finance",
            }

            # 3. Enrich with metadata from fast_info where available
            try:
                fi = stock.fast_info
                result["previous_close"] = float(getattr(fi, "previous_close", 0) or 0)
                result["open"] = float(getattr(fi, "open", 0) or 0)
                result["high"] = float(getattr(fi, "day_high", 0) or 0)
                result["low"] = float(getattr(fi, "day_low", 0) or 0)
                result["volume"] = int(getattr(fi, "last_volume", 0) or 0)
                result["market_cap"] = float(getattr(fi, "market_cap", 0) or 0)
            except Exception:
                pass

            # 4. Best-effort: richer metadata from .info (slow — don't let it block)
            try:
                info = stock.info
                if info and isinstance(info, dict) and len(info) > 3:
                    result["company_name"] = info.get("longName") or info.get("shortName") or ticker
                    result["sector"] = info.get("sector") or ""
                    result["industry"] = info.get("industry") or ""
                    result["pe_ratio"] = info.get("trailingPE") or 0
                    result["dividend_yield"] = info.get("dividendYield") or 0
            except Exception:
                pass

            return result

        except Exception as e:
            logger.error(f"Yahoo Finance fetch failed for {ticker}: {e}")
            return None

    def _fetch_yahoo_history(
        self,
        ticker: str,
        period: str,
        interval: str,
    ) -> Optional[pd.DataFrame]:
        """Fetch historical data from Yahoo Finance."""
        try:
            stock = yf.Ticker(ticker)
            df = stock.history(period=period, interval=interval)

            if df.empty:
                return None

            return df
        except Exception as e:
            logger.error(f"Error fetching Yahoo Finance history for {ticker}: {e}")
            return None

    def _fetch_alpha_vantage(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Fetch current price from Alpha Vantage (free tier)."""
        try:
            import requests

            url = "https://www.alphavantage.co/query"
            params = {
                "function": "GLOBAL_QUOTE",
                "symbol": ticker,
                "apikey": ALPHA_VANTAGE_API_KEY,
            }

            response = requests.get(url, timeout=10)
            data = response.json()

            if "Global Quote" in data:
                quote = data["Global Quote"]
                return {
                    "ticker": ticker,
                    "price": float(quote.get("05. price", 0)),
                    "previous_close": float(quote.get("08. previous close", 0)),
                    "open": float(quote.get("02. open", 0)),
                    "high": float(quote.get("03. high", 0)),
                    "low": float(quote.get("04. low", 0)),
                    "volume": int(quote.get("06. volume", 0)),
                    "change_percent": quote.get("10. change percent", ""),
                    "source": "alpha_vantage",
                }
        except Exception as e:
            logger.error(f"Error fetching Alpha Vantage data for {ticker}: {e}")

        return None

    def _fetch_stooq(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Fetch current price from Stooq."""
        try:
            import requests

            # Stooq US ticker format
            url = f"https://stooq.com/q/l/?s={ticker}&f=sd2t2ohlcv&h&e=csv"
            response = requests.get(url, timeout=10)
            lines = response.text.strip().split("\n")

            if len(lines) >= 2:
                # Parse CSV
                headers = lines[0].split(",")
                values = lines[1].split(",")

                data = dict(zip(headers, values))

                return {
                    "ticker": ticker,
                    "price": float(values[4]) if values[4] else 0,  # Close price
                    "open": float(values[3]) if values[3] else 0,
                    "high": float(values[5]) if values[5] else 0,
                    "low": float(values[6]) if values[6] else 0,
                    "volume": int(values[7]) if values[7] else 0,
                    "date": values[1] if len(values) > 1 else "",
                    "source": "stooq",
                }
        except Exception as e:
            logger.error(f"Error fetching Stooq data for {ticker}: {e}")

        return None

    def invalidate_cache(self, ticker: str | None = None) -> None:
        """Force-expire cached prices so the next call fetches fresh data."""
        if ticker:
            t = ticker.upper()
            self._price_cache.pop(t, None)
            cache_file = self.cache_dir / f"{t}.json"
            if cache_file.exists():
                cache_file.unlink(missing_ok=True)
        else:
            self._price_cache.clear()
            for f in self.cache_dir.glob("*.json"):
                f.unlink(missing_ok=True)

    def batch_get_prices(self, tickers: List[str]) -> Dict[str, Optional[Dict]]:
        """
        Get current prices for multiple tickers.

        Args:
            tickers: List of ticker symbols

        Returns:
            Dictionary mapping ticker to price data
        """
        results = {}
        for ticker in tickers:
            results[ticker] = self.get_current_price(ticker)
        return results

    def get_portfolio_value(self, holdings: List[Dict]) -> Dict[str, Any]:
        """
        Calculate total portfolio value.

        Args:
            holdings: List of holding dictionaries with ticker and shares

        Returns:
            Dictionary with portfolio value breakdown
        """
        total_value = 0
        total_cost = 0
        total_gain_loss = 0

        tickers = [h.get("ticker") for h in holdings if h.get("ticker")]
        prices = self.batch_get_prices(tickers)

        breakdown = []

        for holding in holdings:
            ticker = holding.get("ticker")
            shares = holding.get("shares", 0)
            avg_cost = holding.get("average_cost", 0)

            if ticker and ticker in prices and prices[ticker]:
                price = prices[ticker]["price"]
                value = shares * price
                gain_loss = value - (shares * avg_cost) if avg_cost else 0

                total_value += value
                total_cost += shares * avg_cost if avg_cost else 0
                total_gain_loss += gain_loss

                breakdown.append({
                    "ticker": ticker,
                    "shares": shares,
                    "price": price,
                    "value": round(value, 2),
                    "gain_loss": round(gain_loss, 2),
                    "gain_loss_percent": round((gain_loss / (shares * avg_cost) * 100) if avg_cost else 0, 2),
                })

        return {
            "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "total_gain_loss": round(total_gain_loss, 2),
            "total_gain_loss_percent": round((total_gain_loss / total_cost * 100) if total_cost else 0, 2),
            "breakdown": sorted(breakdown, key=lambda x: x["value"], reverse=True),
        }

    def get_market_insights(self, holdings: List[Dict]) -> Dict[str, Any]:
        """
        Generate market insights for a portfolio.

        Args:
            holdings: List of holding dictionaries

        Returns:
            Dictionary with market insights
        """
        # Get sector and industry breakdown
        sectors = {}
        industries = {}
        holdings_with_data = []

        for holding in holdings:
            ticker = holding.get("ticker")
            if ticker:
                price_data = self.get_current_price(ticker)
                if price_data:
                    holding["current_price"] = price_data["price"]
                    holding["company_name"] = price_data.get("company_name", ticker)
                    holding["sector"] = price_data.get("sector", "Unknown")
                    holding["industry"] = price_data.get("industry", "Unknown")

                    # Sector breakdown
                    sector = holding["sector"]
                    sectors[sector] = sectors.get(sector, 0) + holding.get("shares", 0) * holding.get("current_price", 0)

                    # Industry breakdown
                    industry = holding["industry"]
                    industries[industry] = industries.get(industry, 0) + holding.get("shares", 0) * holding.get("current_price", 0)

                    holdings_with_data.append(holding)

        # Calculate allocation
        total_value = sum(s for s in sectors.values())

        sector_allocation = {
            sector: {
                "value": round(value, 2),
                "percentage": round((value / total_value * 100) if total_value else 0, 2),
            }
            for sector, value in sorted(sectors.items(), key=lambda x: x[1], reverse=True)
        }

        return {
            "total_holdings": len(holdings_with_data),
            "sector_allocation": sector_allocation,
            "top_holdings": sorted(holdings_with_data, key=lambda x: x.get("current_price", 0) * x.get("shares", 0), reverse=True)[:10],
            "updated_at": datetime.now().isoformat(),
        }


# Singleton instance
market_service = MarketDataService()
