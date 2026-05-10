"""
Personal Finance Platform - Portfolio Engine
Calculates portfolio metrics, allocations, and performance
"""

import math
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from decimal import Decimal

from app.services.market_data import market_service


class PortfolioEngine:
    """Engine for portfolio calculations and analytics."""

    def __init__(self):
        self.market_service = market_service

    def calculate_holdings_values(
        self,
        holdings: List[Dict[str, Any]],
        current_prices: Dict[str, float],
    ) -> List[Dict[str, Any]]:
        """
        Calculate current values and gains for holdings.

        Args:
            holdings: List of holding dictionaries
            current_prices: Dictionary mapping ticker to price

        Returns:
            List of holdings with calculated values
        """
        result = []

        for holding in holdings:
            ticker = holding.get("ticker")
            shares = holding.get("shares", 0)
            avg_cost = holding.get("average_cost", 0)
            purchase_date = holding.get("purchase_date")

            if ticker and ticker in current_prices:
                current_price = current_prices[ticker]
                current_value = shares * current_price
                gain_loss = current_value - (shares * avg_cost) if avg_cost else 0
                gain_loss_percent = (gain_loss / (shares * avg_cost) * 100) if avg_cost else 0

                result.append({
                    **holding,
                    "current_price": current_price,
                    "current_value": round(current_value, 2),
                    "total_gain_loss": round(gain_loss, 2),
                    "total_gain_loss_percent": round(gain_loss_percent, 2),
                    "is_active": 1,
                })
            else:
                # Use provided current price or calculate from current value
                current_price = holding.get("current_price", 0)
                current_value = holding.get("current_value", shares * current_price)

                result.append({
                    **holding,
                    "current_price": current_price,
                    "current_value": round(current_value, 2),
                    "total_gain_loss": round(current_value - (shares * avg_cost) if avg_cost else 0, 2),
                    "total_gain_loss_percent": 0,
                    "is_active": 1,
                })

        return result

    def calculate_weighted_cost_basis(self, holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate weighted cost basis for a portfolio.

        Args:
            holdings: List of holding dictionaries

        Returns:
            Dictionary with weighted cost basis information
        """
        total_value = 0
        total_cost = 0

        for holding in holdings:
            shares = holding.get("shares", 0)
            avg_cost = holding.get("average_cost", 0)
            current_price = holding.get("current_price", avg_cost)

            value = shares * current_price
            cost = shares * avg_cost

            total_value += value
            total_cost += cost

        weighted_cost_basis = total_cost / total_value if total_value else 0

        return {
            "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "weighted_cost_basis": round(weighted_cost_basis, 4),
            "total_gain_loss": round(total_value - total_cost, 2),
            "total_gain_loss_percent": round(((total_value - total_cost) / total_cost * 100) if total_cost else 0, 2),
        }

    def calculate_asset_allocation(self, holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate asset allocation by sector and type.

        Args:
            holdings: List of holding dictionaries

        Returns:
            Dictionary with allocation breakdown
        """
        # Calculate total value
        total_value = sum(h.get("current_value", 0) for h in holdings)

        if not total_value:
            return {
                "total_value": 0,
                "allocations": {},
                "summary": {},
            }

        # Sector allocation
        sectors = {}
        for holding in holdings:
            sector = holding.get("sector", "Unknown") or "Unknown"
            value = holding.get("current_value", 0)

            if sector not in sectors:
                sectors[sector] = 0
            sectors[sector] += value

        # Security type allocation
        types = {}
        for holding in holdings:
            sec_type = holding.get("security_type", "stock") or "stock"
            value = holding.get("current_value", 0)

            if sec_type not in types:
                types[sec_type] = 0
            types[sec_type] += value

        # Convert to percentages
        sector_allocation = {
            sector: {
                "value": round(value, 2),
                "percentage": round((value / total_value * 100), 2),
            }
            for sector, value in sorted(sectors.items(), key=lambda x: x[1], reverse=True)
        }

        type_allocation = {
            sec_type: {
                "value": round(value, 2),
                "percentage": round((value / total_value * 100), 2),
            }
            for sec_type, value in sorted(types.items(), key=lambda x: x[1], reverse=True)
        }

        return {
            "total_value": round(total_value, 2),
            "sector_allocation": sector_allocation,
            "type_allocation": type_allocation,
            "num_sectors": len(sectors),
            "num_holdings": len(holdings),
        }

    def calculate_portfolio_performance(
        self,
        holdings: List[Dict[str, Any]],
        start_date: datetime = None,
    ) -> Dict[str, Any]:
        """
        Calculate portfolio performance metrics.

        Args:
            holdings: List of holding dictionaries
            start_date: Start date for performance calculation

        Returns:
            Dictionary with performance metrics
        """
        total_value = sum(h.get("current_value", 0) for h in holdings)
        total_cost = sum(
            h.get("shares", 0) * h.get("average_cost", 0)
            for h in holdings
        )

        # Calculate portfolio yield
        total_dividends = sum(h.get("dividend_yield", 0) * h.get("current_value", 0) / 100 for h in holdings)
        annual_yield = (total_dividends / total_value * 100) if total_value else 0

        return {
            "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "total_return": round(total_value - total_cost, 2),
            "total_return_percent": round(((total_value - total_cost) / total_cost * 100) if total_cost else 0, 2),
            "annual_yield_percent": round(annual_yield, 2),
            "num_holdings": len(holdings),
            "start_date": start_date.isoformat() if start_date else None,
            "as_of_date": datetime.now().isoformat(),
        }

    def calculate_net_worth(
        self,
        assets: Dict[str, Any],
        liabilities: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Calculate net worth from assets and liabilities.

        Args:
            assets: Dictionary of asset categories and values
            liabilities: Dictionary of liability categories and amounts

        Returns:
            Dictionary with net worth breakdown
        """
        total_assets = sum(assets.values())
        total_liabilities = sum(liabilities.values())

        # Asset breakdown
        asset_breakdown = {
            category: {
                "amount": round(amount, 2),
                "percentage": round((amount / total_assets * 100) if total_assets else 0, 2),
            }
            for category, amount in assets.items()
        }

        # Liability breakdown
        liability_breakdown = {
            category: {
                "amount": round(amount, 2),
                "percentage": round((amount / total_liabilities * 100) if total_liabilities else 0, 2),
            }
            for category, amount in liabilities.items()
        }

        return {
            "total_assets": round(total_assets, 2),
            "total_liabilities": round(total_liabilities, 2),
            "net_worth": round(total_assets - total_liabilities, 2),
            "debt_to_asset_ratio": round((total_liabilities / total_assets * 100) if total_assets else 0, 2),
            "asset_breakdown": asset_breakdown,
            "liability_breakdown": liability_breakdown,
            "calculated_at": datetime.now().isoformat(),
        }

    def calculate_portfolio_health(
        self,
        holdings: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Calculate portfolio health metrics.

        Args:
            holdings: List of holding dictionaries

        Returns:
            Dictionary with health metrics
        """
        if not holdings:
            return {"error": "No holdings provided"}

        # Calculate total value
        total_value = sum(h.get("current_value", 0) for h in holdings)

        # Calculate average gain/loss
        gains = [h for h in holdings if h.get("total_gain_loss_percent", 0) > 0]
        losses = [h for h in holdings if h.get("total_gain_loss_percent", 0) < 0]

        avg_gain = sum(h.get("total_gain_loss_percent", 0) for h in gains) / len(gains) if gains else 0
        avg_loss = sum(h.get("total_gain_loss_percent", 0) for h in losses) / len(losses) if losses else 0

        # Calculate concentration (top holding percentage)
        sorted_holdings = sorted(holdings, key=lambda x: x.get("current_value", 0), reverse=True)
        top_holding_percent = (
            sorted_holdings[0].get("current_value", 0) / total_value * 100
        ) if sorted_holdings and total_value else 0

        # Calculate cash position
        cash_holdings = [h for h in holdings if h.get("security_type") == "cash"]
        cash_value = sum(h.get("current_value", 0) for h in cash_holdings)
        cash_position = (cash_value / total_value * 100) if total_value else 0

        return {
            "total_value": round(total_value, 2),
            "num_holdings": len(holdings),
            "num_gainers": len(gains),
            "num_losers": len(losses),
            "average_gain_percent": round(avg_gain, 2),
            "average_loss_percent": round(avg_loss, 2),
            "top_holding_percent": round(top_holding_percent, 2),
            "cash_position_percent": round(cash_position, 2),
            "health_score": self._calculate_health_score(
                gains, losses, top_holding_percent, cash_position
            ),
        }

    def _calculate_health_score(
        self,
        gains: List[Dict],
        losses: List[Dict],
        top_holding_percent: float,
        cash_position_percent: float,
    ) -> int:
        """Calculate a portfolio health score (0-100)."""
        score = 100

        # Deduct for high concentration (>30%)
        if top_holding_percent > 30:
            score -= min(20, (top_holding_percent - 30) / 2)

        # Deduct for high cash position (>25%)
        if cash_position_percent > 25:
            score -= min(10, (cash_position_percent - 25) / 5)

        # Bonus for good gain/loss ratio
        gain_count = len(gains)
        loss_count = len(losses)
        total = gain_count + loss_count

        if total > 0:
            gain_ratio = gain_count / total
            if gain_ratio > 0.7:
                score += 5
            elif gain_ratio < 0.3:
                score -= 5

        return max(0, min(100, int(score)))


# Singleton instance
portfolio_engine = PortfolioEngine()
