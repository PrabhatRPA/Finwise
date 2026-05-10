#!/usr/bin/env python3
"""
Seed the database with sample data
"""

import os
import sys
from pathlib import Path
from datetime import datetime, timedelta
import random

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from app.core.config import DATABASE_URL, DATABASE_DIR
from app.db import SessionLocal
from app.db.models import User, Account, Holding, Transaction, Loan, MarketPrice


def generate_sample_data():
    """Generate sample data for demonstration."""
    db = SessionLocal()

    try:
        # Create or get default user
        user = db.query(User).filter(User.username == "demo").first()
        if not user:
            from app.core.security import get_password_hash
            user = User(
                username="demo",
                email="demo@localhost.com",
                password_hash=get_password_hash("demo123"),
                full_name="Demo User",
                created_at=datetime.utcnow(),
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Created user: {user.id}")
        else:
            db.refresh(user)

        user_id = user.id

        # Create sample accounts
        accounts = [
            Account(
                user_id=user_id,
                account_name="Vanguard Brokerage",
                account_type="brokerage",
                institution_name="Vanguard",
                institution_type="Brokerage",
                balance=0,
                currency="USD",
            ),
            Account(
                user_id=user_id,
                account_name="Fidelity IRA",
                account_type="traditional_ira",
                institution_name="Fidelity",
                institution_type="Retirement",
                balance=0,
                currency="USD",
            ),
            Account(
                user_id=user_id,
                account_name="Chase Checking",
                account_type="checking",
                institution_name="Chase",
                institution_type="Bank",
                balance=5000.00,
                currency="USD",
            ),
            Account(
                user_id=user_id,
                account_name="High Yield Savings",
                account_type="savings",
                institution_name="Ally",
                institution_type="Bank",
                balance=15000.00,
                currency="USD",
            ),
        ]

        for account in accounts:
            existing = db.query(Account).filter(
                Account.user_id == user_id,
                Account.account_name == account.account_name
            ).first()
            if not existing:
                db.add(account)
                print(f"Created account: {account.account_name}")

        db.commit()

        # Get account IDs
        vanguard_acct = db.query(Account).filter(
            Account.user_id == user_id,
            Account.account_name == "Vanguard Brokerage"
        ).first()

        fidelity_acct = db.query(Account).filter(
            Account.user_id == user_id,
            Account.account_name == "Fidelity IRA"
        ).first()

        checking_acct = db.query(Account).filter(
            Account.user_id == user_id,
            Account.account_name == "Chase Checking"
        ).first()

        savings_acct = db.query(Account).filter(
            Account.user_id == user_id,
            Account.account_name == "High Yield Savings"
        ).first()

        # Create sample holdings
        sample_holdings = [
            # Stock holdings
            Holding(
                user_id=user_id,
                account_id=vanguard_acct.id,
                ticker="AAPL",
                security_name="Apple Inc.",
                security_type="stock",
                shares=50,
                average_cost=150.00,
                current_price=175.50,
                current_value=8775.00,
                total_gain_loss=1275.00,
                total_gain_loss_percent=21.25,
                dividend_yield=0.55,
                sector="Technology",
                industry="Consumer Electronics",
                purchase_date=datetime(2023, 1, 15),
                last_updated=datetime.utcnow(),
            ),
            Holding(
                user_id=user_id,
                account_id=vanguard_acct.id,
                ticker="MSFT",
                security_name="Microsoft Corporation",
                security_type="stock",
                shares=30,
                average_cost=280.00,
                current_price=330.00,
                current_value=9900.00,
                total_gain_loss=1500.00,
                total_gain_loss_percent=17.86,
                dividend_yield=0.85,
                sector="Technology",
                industry="Software",
                purchase_date=datetime(2023, 2, 1),
                last_updated=datetime.utcnow(),
            ),
            Holding(
                user_id=user_id,
                account_id=vanguard_acct.id,
                ticker="VTI",
                security_name="Vanguard Total Stock Market ETF",
                security_type="etf",
                shares=100,
                average_cost=200.00,
                current_price=230.00,
                current_value=23000.00,
                total_gain_loss=3000.00,
                total_gain_loss_percent=15.0,
                dividend_yield=1.4,
                sector="ETF",
                industry="Market",
                purchase_date=datetime(2023, 3, 1),
                last_updated=datetime.utcnow(),
            ),
            Holding(
                user_id=user_id,
                account_id=vanguard_acct.id,
                ticker="VOO",
                security_name="Vanguard S&P 500 ETF",
                security_type="etf",
                shares=75,
                average_cost=380.00,
                current_price=415.00,
                current_value=31125.00,
                total_gain_loss=2625.00,
                total_gain_loss_percent=9.26,
                dividend_yield=1.35,
                sector="ETF",
                industry="Market",
                purchase_date=datetime(2023, 4, 15),
                last_updated=datetime.utcnow(),
            ),
            # IRA holdings
            Holding(
                user_id=user_id,
                account_id=fidelity_acct.id,
                ticker="VTI",
                security_name="Vanguard Total Stock Market ETF",
                security_type="etf",
                shares=150,
                average_cost=185.00,
                current_price=230.00,
                current_value=34500.00,
                total_gain_loss=6750.00,
                total_gain_loss_percent=32.43,
                dividend_yield=1.4,
                sector="ETF",
                industry="Market",
                purchase_date=datetime(2022, 6, 1),
                last_updated=datetime.utcnow(),
            ),
            Holding(
                user_id=user_id,
                account_id=fidelity_acct.id,
                ticker="BND",
                security_name="Vanguard Total Bond Market ETF",
                security_type="bond",
                shares=200,
                average_cost=75.00,
                current_price=78.00,
                current_value=15600.00,
                total_gain_loss=600.00,
                total_gain_loss_percent=4.0,
                dividend_yield=2.8,
                sector="Fixed Income",
                industry="Bonds",
                purchase_date=datetime(2022, 12, 1),
                last_updated=datetime.utcnow(),
            ),
        ]

        for holding in sample_holdings:
            existing = db.query(Holding).filter(
                Holding.user_id == user_id,
                Holding.ticker == holding.ticker
            ).first()
            if not existing:
                db.add(holding)
                print(f"Created holding: {holding.ticker}")

        db.commit()

        # Create sample loan
        mortgage = db.query(Loan).filter(
            Loan.user_id == user_id,
            Loan.loan_name == "Mortgage"
        ).first()
        if not mortgage:
            mortgage = Loan(
                user_id=user_id,
                loan_name="Mortgage",
                loan_type="mortgage",
                original_balance=350000.00,
                current_balance=325000.00,
                interest_rate=5.5,
                monthly_payment=1990.00,
                start_date=datetime(2020, 1, 1),
                end_date=datetime(2050, 1, 1),
                due_day=1,
                status="active",
                lender_name="Big Bank",
                lender_type="Bank",
            )
            db.add(mortgage)
            print("Created loan: Mortgage")

        db.commit()

        # Create sample market prices
        market_prices = [
            MarketPrice(ticker="AAPL", price=175.50, price_date=datetime.now().date(), source="yahoo_finance"),
            MarketPrice(ticker="MSFT", price=330.00, price_date=datetime.now().date(), source="yahoo_finance"),
            MarketPrice(ticker="VTI", price=230.00, price_date=datetime.now().date(), source="yahoo_finance"),
            MarketPrice(ticker="VOO", price=415.00, price_date=datetime.now().date(), source="yahoo_finance"),
            MarketPrice(ticker="BND", price=78.00, price_date=datetime.now().date(), source="yahoo_finance"),
        ]

        for price in market_prices:
            existing = db.query(MarketPrice).filter(
                MarketPrice.ticker == price.ticker,
                MarketPrice.price_date == price.price_date
            ).first()
            if not existing:
                db.add(price)
                print(f"Created market price: {price.ticker}")

        db.commit()

        print("\n" + "="*50)
        print("Sample data created successfully!")
        print("="*50)
        print("\nLogin credentials: demo / demo123")
        print(f"Total Holdings: {len(sample_holdings)}")
        print(f"Total Accounts: {len(accounts)}")
        print(f"Total Liabilities: 1")

    finally:
        db.close()


if __name__ == "__main__":
    generate_sample_data()
