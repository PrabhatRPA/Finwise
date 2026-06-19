#!/usr/bin/env python3
"""Generate a dummy Nworth dataset for testing all features and charts.

Produces a JSON file in the app's `importFullData` format:
holdings, accounts, transactions, watchlist, loans, properties, portfolio_history.

Import it on-device via: Profile -> Manage exports & backups -> Import All Data
JSON, with mode "Replace existing".
"""
import json
import math
import random
from datetime import date, timedelta

random.seed(42)

# ── Holdings: 24 tickers spanning types & sectors ───────────────────────────
# (ticker, name, type, sector, shares, avg_cost, approx_price)
H = [
    ("AAPL",   "Apple Inc.",                 "stock", "Technology",             40,  150.00, 230.00),
    ("MSFT",   "Microsoft Corp.",            "stock", "Technology",             25,  300.00, 440.00),
    ("NVDA",   "NVIDIA Corp.",               "stock", "Technology",             60,   45.00, 130.00),
    ("GOOGL",  "Alphabet Inc.",              "stock", "Communication Services", 30,  120.00, 175.00),
    ("AMZN",   "Amazon.com Inc.",            "stock", "Consumer Discretionary", 35,  140.00, 185.00),
    ("META",   "Meta Platforms Inc.",        "stock", "Communication Services", 15,  330.00, 560.00),
    ("TSLA",   "Tesla Inc.",                 "stock", "Consumer Discretionary", 20,  280.00, 250.00),
    ("JPM",    "JPMorgan Chase & Co.",       "stock", "Financials",             18,  150.00, 215.00),
    ("V",      "Visa Inc.",                  "stock", "Financials",             22,  210.00, 280.00),
    ("JNJ",    "Johnson & Johnson",          "stock", "Healthcare",             16,  165.00, 155.00),
    ("UNH",    "UnitedHealth Group",         "stock", "Healthcare",              8,  480.00, 520.00),
    ("XOM",    "Exxon Mobil Corp.",          "stock", "Energy",                 45,   95.00, 115.00),
    ("PG",     "Procter & Gamble Co.",       "stock", "Consumer Staples",       20,  145.00, 170.00),
    ("HD",     "Home Depot Inc.",            "stock", "Consumer Discretionary", 10,  320.00, 390.00),
    ("DIS",    "Walt Disney Co.",            "stock", "Communication Services", 30,  120.00,  95.00),
    ("SPY",    "SPDR S&P 500 ETF",           "etf",   "Index Fund",             25,  400.00, 560.00),
    ("QQQ",    "Invesco QQQ Trust",          "etf",   "Index Fund",             20,  330.00, 480.00),
    ("VTI",    "Vanguard Total Market ETF",  "etf",   "Index Fund",             30,  210.00, 280.00),
    ("SCHD",   "Schwab US Dividend ETF",     "etf",   "Dividend",              150,   72.00,  28.00),
    ("BND",    "Vanguard Total Bond ETF",    "bond",  "Fixed Income",          100,   78.00,  73.00),
    ("O",      "Realty Income Corp.",        "reit",  "Real Estate",            80,   62.00,  58.00),
    ("PLD",    "Prologis Inc.",              "reit",  "Real Estate",            25,  110.00, 120.00),
    ("BTC-USD","Bitcoin",                    "crypto","Cryptocurrency",          0.5, 38000.0, 65000.0),
    ("ETH-USD","Ethereum",                   "crypto","Cryptocurrency",          4.0, 2200.0,  3200.0),
]

ACCOUNTS_FOR_HOLDING = ["Fidelity", "Schwab", "Robinhood", "Coinbase"]

holdings = []
for i, (tk, name, typ, sector, shares, avg, px) in enumerate(H):
    acct = "Coinbase" if typ == "crypto" else ACCOUNTS_FOR_HOLDING[i % 3]
    value = round(shares * px, 2)
    cost = shares * avg
    gl = round(value - cost, 2)
    glp = round((gl / cost) * 100, 2) if cost else 0
    # Purchase date: staggered over the last ~2 years.
    pdate = (date.today() - timedelta(days=300 + i * 18)).isoformat()
    holdings.append({
        "ticker": tk,
        "security_name": name,
        "security_type": typ,
        "shares": shares,
        "average_cost": avg,
        "current_price": px,          # fallback; live fetch updates this on load
        "current_value": value,
        "total_gain_loss": gl,
        "total_gain_loss_percent": glp,
        "sector": sector,
        "industry": sector,
        "purchase_date": pdate,
        "account_name": acct,
    })

# ── Accounts: brokerages (0 cash) + cash accounts ───────────────────────────
accounts = [
    {"account_name": "Fidelity",        "account_type": "brokerage", "institution_name": "Fidelity",        "balance": 0,     "currency": "USD"},
    {"account_name": "Schwab",          "account_type": "brokerage", "institution_name": "Charles Schwab",  "balance": 0,     "currency": "USD"},
    {"account_name": "Robinhood",       "account_type": "brokerage", "institution_name": "Robinhood",       "balance": 0,     "currency": "USD"},
    {"account_name": "Coinbase",        "account_type": "brokerage", "institution_name": "Coinbase",        "balance": 0,     "currency": "USD"},
    {"account_name": "Chase Checking",  "account_type": "checking",  "institution_name": "Chase",           "balance": 12500, "currency": "USD"},
    {"account_name": "Ally Savings",    "account_type": "savings",   "institution_name": "Ally Bank",       "balance": 48000, "currency": "USD"},
    {"account_name": "Fidelity 401k",   "account_type": "retirement","institution_name": "Fidelity",        "balance": 95000, "currency": "USD"},
]

# ── Loans / debts ───────────────────────────────────────────────────────────
loans = [
    {"loan_name": "Home Mortgage",  "loan_type": "mortgage",    "original_balance": 450000, "current_balance": 382000, "interest_rate": 3.5,  "monthly_payment": 2100, "lender_name": "Wells Fargo",      "due_day": 1,  "status": "active"},
    {"loan_name": "Auto Loan",      "loan_type": "auto",        "original_balance": 35000,  "current_balance": 17800,  "interest_rate": 4.2,  "monthly_payment": 600,  "lender_name": "Toyota Financial", "due_day": 15, "status": "active"},
    {"loan_name": "Student Loan",   "loan_type": "student",     "original_balance": 60000,  "current_balance": 21500,  "interest_rate": 5.0,  "monthly_payment": 450,  "lender_name": "Sallie Mae",       "due_day": 20, "status": "active"},
    {"loan_name": "Amex Platinum",  "loan_type": "credit_card", "original_balance": 8000,   "current_balance": 3200,   "interest_rate": 19.99,"monthly_payment": 250,  "lender_name": "American Express", "due_day": 10, "status": "active"},
]

# ── Properties ──────────────────────────────────────────────────────────────
properties = [
    {"property_type": "single_family", "nickname": "Primary Home", "address": "123 Maple Ave", "city": "Austin",  "state": "TX", "zip_code": "78704", "country": "US", "manual_value": 625000, "purchase_price": 450000, "purchase_date": "2019-06-15", "notes": "Primary residence"},
    {"property_type": "condo",         "nickname": "Rental Condo",  "address": "88 Lakeview Dr","city": "Denver",  "state": "CO", "zip_code": "80202", "country": "US", "manual_value": 315000, "purchase_price": 250000, "purchase_date": "2021-03-01", "notes": "Rented out, ~$2k/mo"},
]

# ── Watchlist: tickers NOT already held ─────────────────────────────────────
watchlist = [
    {"ticker": "AMD",  "company_name": "Advanced Micro Devices", "target_price": 130, "target_direction": "above", "notification_method": "in_app", "notes": "Buy on dip"},
    {"ticker": "CRM",  "company_name": "Salesforce Inc.",        "target_price": 240, "target_direction": "below", "notification_method": "in_app", "notes": ""},
    {"ticker": "COST", "company_name": "Costco Wholesale",       "target_price": 800, "target_direction": "below", "notification_method": "in_app", "notes": "Wait for pullback"},
    {"ticker": "KO",   "company_name": "Coca-Cola Co.",          "target_price": 60,  "target_direction": "below", "notification_method": "in_app", "notes": ""},
    {"ticker": "NFLX", "company_name": "Netflix Inc.",           "target_price": 500, "target_direction": "below", "notification_method": "in_app", "notes": ""},
    {"ticker": "PYPL", "company_name": "PayPal Holdings",        "target_price": 60,  "target_direction": "above", "notification_method": "in_app", "notes": "Turnaround play"},
]

# ── Transactions: a sample of buys/sells/dividends ──────────────────────────
txns = []
sample = [("AAPL", "Fidelity"), ("MSFT", "Fidelity"), ("NVDA", "Schwab"),
          ("SPY", "Schwab"), ("TSLA", "Robinhood"), ("BTC-USD", "Coinbase")]
for j, (tk, acct) in enumerate(sample):
    px = next(h["current_price"] for h in holdings if h["ticker"] == tk)
    sh = 5 if tk not in ("BTC-USD",) else 0.1
    tdate = (date.today() - timedelta(days=200 - j * 25)).isoformat()
    txns.append({
        "transaction_type": "buy", "transaction_date": tdate, "ticker": tk,
        "shares": sh, "price_per_share": round(px * 0.9, 2),
        "total_amount": round(sh * px * 0.9, 2), "commission": 0, "fees": 0,
        "account_name": acct, "description": f"Bought {sh} {tk}",
    })
# A couple of dividends + a sell
txns.append({"transaction_type": "dividend", "transaction_date": (date.today() - timedelta(days=40)).isoformat(),
             "ticker": "SCHD", "shares": None, "price_per_share": None, "total_amount": 110.25,
             "commission": 0, "fees": 0, "account_name": "Fidelity", "description": "SCHD quarterly dividend"})
txns.append({"transaction_type": "dividend", "transaction_date": (date.today() - timedelta(days=12)).isoformat(),
             "ticker": "O", "shares": None, "price_per_share": None, "total_amount": 21.40,
             "commission": 0, "fees": 0, "account_name": "Fidelity", "description": "Realty Income monthly dividend"})
txns.append({"transaction_type": "sell", "transaction_date": (date.today() - timedelta(days=30)).isoformat(),
             "ticker": "DIS", "shares": 10, "price_per_share": 98.0, "total_amount": 980.0,
             "commission": 0, "fees": 0, "account_name": "Robinhood", "description": "Trimmed DIS position"})

# ── Current net worth (to anchor the history series end) ─────────────────────
investments = sum(h["current_value"] for h in holdings)
cash = sum(a["balance"] for a in accounts)
real_estate = sum(p["manual_value"] for p in properties)
liabilities = sum(l["current_balance"] for l in loans)
assets_now = investments + cash + real_estate
net_now = assets_now - liabilities

# ── portfolio_history: 18 months of daily snapshots trending up ─────────────
DAYS = 545  # ~18 months
history = []
# Start ~32% below today's investment level, grow with noise + a dip.
inv_start = investments * 0.68
re_start = real_estate * 0.92      # property appreciates slowly
cash_start = cash * 0.75
liab_start = liabilities * 1.18    # debt paid down over time
for d in range(DAYS, -1, -1):
    day = date.today() - timedelta(days=d)
    t = (DAYS - d) / DAYS  # 0..1 progress
    # Smooth growth with a mid-period correction and daily noise.
    trend = t
    wave = 0.06 * math.sin(t * math.pi * 3)        # cyclical swings
    dip = -0.10 if 0.45 < t < 0.55 else 0.0        # a correction window
    noise = random.uniform(-0.012, 0.012)
    factor = 1 + (trend) * ((investments / inv_start) - 1) + wave + dip + noise
    inv = max(0.0, inv_start * factor)
    re_v = re_start + (real_estate - re_start) * t
    csh = cash_start + (cash - cash_start) * t + random.uniform(-400, 400)
    liab = liab_start + (liabilities - liab_start) * t
    assets = inv + re_v + csh
    history.append({
        "history_date": day.isoformat(),
        "total_assets": round(assets, 2),
        "total_liabilities": round(liab, 2),
        "total_net_worth": round(assets - liab, 2),
        "total_investments": round(inv, 2),
        "total_cash": round(csh, 2),
    })
# Force the final point to match today's computed values exactly.
history[-1] = {
    "history_date": date.today().isoformat(),
    "total_assets": round(assets_now, 2),
    "total_liabilities": round(liabilities, 2),
    "total_net_worth": round(net_now, 2),
    "total_investments": round(investments, 2),
    "total_cash": round(cash, 2),
}

payload = {
    "version": 1,
    "exported_at": date.today().isoformat() + "T00:00:00Z",
    "source": "nworth-dummy-data",
    "holdings": holdings,
    "accounts": accounts,
    "transactions": txns,
    "watchlist": watchlist,
    "loans": loans,
    "properties": properties,
    "portfolio_history": history,
}

out = "nworth_dummy_data.json"
with open(out, "w") as f:
    json.dump(payload, f, indent=2)

print(f"Wrote {out}")
print(f"  holdings:          {len(holdings)}")
print(f"  accounts:          {len(accounts)}")
print(f"  transactions:      {len(txns)}")
print(f"  watchlist:         {len(watchlist)}")
print(f"  loans:             {len(loans)}")
print(f"  properties:        {len(properties)}")
print(f"  portfolio_history: {len(history)} daily snapshots")
print(f"  investments=${investments:,.0f}  cash=${cash:,.0f}  real_estate=${real_estate:,.0f}")
print(f"  liabilities=${liabilities:,.0f}  net_worth=${net_now:,.0f}")
