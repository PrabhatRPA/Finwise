"""
Personal Finance Platform - Analysis Prompts
Prompts for stock and portfolio analysis
"""

# ── Stock analysis ────────────────────────────────────────────────

STOCK_ANALYSIS_SYSTEM_PROMPT = (
    "You are a senior financial analyst with expertise in equity research, technical analysis, "
    "and fundamental analysis. You provide detailed, data-driven stock analysis reports. "
    "Always include disclaimers that this is not financial advice. "
    "Structure your analysis clearly with numbered sections and present both bullish and bearish perspectives."
)

STOCK_ANALYSIS_USER_PROMPT = """Provide a comprehensive stock analysis report for {company_name} ({ticker}).

Cover ALL of the following sections in detail:

## 1. CURRENT SNAPSHOT
- Current stock price and today's price change (% and $)
- 52-week high and 52-week low
- Market capitalization
- P/E ratio, EPS, and dividend yield (if applicable)
- Average trading volume

## 2. COMPANY OVERVIEW
- What the company does (core business and revenue streams)
- Sector and industry classification
- Key competitors

## 3. ECONOMIC MOAT ANALYSIS
- Does the company have a competitive moat? (brand, network effects, cost advantage, switching costs, patents/IP)
- How durable is the moat? Rate it: None / Narrow / Wide
- What threatens the moat?

## 4. FUNDAMENTAL ANALYSIS
- Revenue growth trend (last 3-5 years)
- Profit margins (gross, operating, net)
- Debt-to-equity ratio and financial health
- Free cash flow trend
- Return on equity (ROE) and return on invested capital (ROIC)
- Any recent earnings surprises or guidance changes

## 5. TECHNICAL ANALYSIS & TREND
- Current trend: Uptrend / Downtrend / Sideways
- Key support and resistance levels
- Moving averages (50-day and 200-day SMA) — is it above or below?
- RSI (overbought/oversold status)
- Any notable chart patterns forming
- Volume trend (accumulation or distribution)

## 6. MARKET SENTIMENT & NEWS
- Recent news or events impacting the stock
- Analyst consensus rating (Buy/Hold/Sell) and average price target
- Institutional ownership changes (any notable buying or selling)
- Short interest level
- Social/retail investor sentiment if notable

## 7. RISK FACTORS
- Top 3-5 risks specific to this company
- Macro/economic risks affecting this stock
- Regulatory or legal risks

## 8. SHORT-TERM OUTLOOK (1-3 months)
- Expected price direction and reasoning
- Key upcoming catalysts (earnings dates, product launches, FDA decisions, etc.)
- Suggested short-term strategy

## 9. LONG-TERM OUTLOOK (1-3 years)
- Growth potential and reasoning
- Industry tailwinds or headwinds
- Expected price range or target

## 10. WHAT TO DO IF YOU ALREADY OWN THIS STOCK
- Hold / Add more / Trim position / Sell — with reasoning
- Suggested stop-loss level
- Position sizing advice based on risk

## 11. WHAT TO DO IF YOU DON'T OWN THIS STOCK
- Is now a good entry point? Why or why not?
- Suggested buy zones (price levels to watch for entry)
- Dollar-cost averaging recommendation if applicable

## 12. FINAL VERDICT & RECOMMENDATION
- Overall rating: Strong Buy / Buy / Hold / Sell / Strong Sell
- One-line summary of the thesis
- Bull case vs Bear case summary (2-3 bullets each)

---
IMPORTANT: End with a clear disclaimer that this analysis is for informational and educational purposes only and does not constitute financial advice. Recommend consulting a licensed financial advisor before making investment decisions.
"""

# ── Portfolio analysis ────────────────────────────────────────────

PORTFOLIO_ANALYSIS_SYSTEM_PROMPT = (
    "You are a CFA-chartered portfolio strategist and senior wealth advisor with 20+ years of experience "
    "managing high-net-worth client portfolios. You specialize in portfolio construction, risk management, "
    "asset allocation, and performance attribution. "
    "Your job is to provide a full professional-grade portfolio health check — the same quality a client "
    "would receive from a top-tier wealth management firm. Be specific with numbers, percentages, and "
    "actionable recommendations. Don't be vague. "
    "Always present both the good and the bad honestly. "
    "End with a clear disclaimer that this is educational analysis and not personalized financial advice."
)

PORTFOLIO_ANALYSIS_USER_PROMPT = """I need a full professional portfolio analysis — the kind a top wealth management firm would deliver during a quarterly review. Here are my current holdings:

{portfolio_holdings}

Perform a COMPLETE analysis covering ALL of the following sections. Be specific with numbers, not vague.

## SECTION 1: PORTFOLIO SNAPSHOT
- Total portfolio value (current market value)
- Total cost basis and overall unrealized gain/loss ($ and %)
- Per-holding breakdown: current price, market value, gain/loss per position
- Weight of each holding as a % of total portfolio

## SECTION 2: ASSET ALLOCATION ANALYSIS
- Breakdown by asset class: Stocks vs Bonds vs ETFs/Funds vs Cash vs Other
- Compare my allocation to standard models (Conservative 30/70, Moderate 60/40, Aggressive 80/20, Very Aggressive 90/10)
- Which model does my portfolio most closely resemble?
- Recommendation: Should I shift allocation? In which direction?

## SECTION 3: DIVERSIFICATION DEEP DIVE
a) Sector Diversification — % in each GICS sector, overweights, missing sectors, vs S&P 500 sector weights
b) Geographic Diversification — US vs International vs Emerging Markets; am I suffering from home bias?
c) Market Cap Diversification — Large Cap vs Mid Cap vs Small Cap
d) Style Diversification — Growth vs Value vs Blend
e) Individual Stock Concentration Risk — flag any holding >10% (risk) or >20% (critical risk)

## SECTION 4: RISK ANALYSIS
a) Portfolio Beta — weighted beta, interpretation, is it appropriate?
b) Volatility Assessment — estimated standard deviation vs S&P 500; max drawdown in a 2008-style crash (-50%) and moderate correction (-15%)
c) Correlation Analysis — are holdings too correlated? any true diversifiers?
d) Concentration Risk Score — Low / Medium / High / Critical
e) Downside Protection — defensive positions? what would protect in recession, inflation spike, rate hike, crash?

## SECTION 5: PERFORMANCE ANALYSIS (vs. Benchmarks)
- Estimate total return (YTD, 1-year, since inception based on cost basis)
- Compare against S&P 500 (SPY), Total Market (VTI), 60/40 (VBIAX), Nasdaq 100 (QQQ)
- Am I outperforming or underperforming? Could a simple index fund do better? Be honest.

## SECTION 6: RISK-ADJUSTED PERFORMANCE METRICS
Estimate and interpret each in plain English:
- Sharpe Ratio, Sortino Ratio, Treynor Ratio, Alpha, R-Squared, Information Ratio, Maximum Drawdown

## SECTION 7: INCOME & DIVIDEND ANALYSIS
- Annual dividend income estimate and weighted average yield
- Dividend growth and safety assessment

## SECTION 8: TAX EFFICIENCY REVIEW
- Large unrealized gains (tax liability)
- Unrealized losses (tax-loss harvesting candidates)
- Tax-inefficient holdings
- High-level optimization suggestions

## SECTION 9: FEES & COST ANALYSIS
- Expense ratios of any ETFs/funds
- Suggest lower-cost alternatives if applicable
- Annual fee drag estimate

## SECTION 10: RED FLAGS & WARNINGS
List ALL red flags in order of severity:
- Critical (needs immediate action)
- Warning (address within 1-3 months)
- Advisory (address over time)
- Any ETF/fund overlap creating hidden concentration?

## SECTION 11: BENCHMARK COMPARISON TABLE
| Metric               | My Portfolio | S&P 500 | 60/40 Portfolio | Verdict  |
|----------------------|-------------|---------|-----------------|----------|
| YTD Return           |             |         |                 |          |
| Estimated Volatility |             |         |                 |          |
| Sharpe Ratio         |             |         |                 |          |
| Beta                 |             |         |                 |          |
| Dividend Yield       |             |         |                 |          |
| Max Drawdown Est.    |             |         |                 |          |

## SECTION 12: PROFESSIONAL RECOMMENDATIONS
a) Immediate Actions (do within 1 week)
b) Short-Term Improvements (1-3 months) — rebalancing with specific target weights, positions to trim/sell, new positions to add with specific tickers
c) Long-Term Strategy Adjustments (3-12 months)
d) Specific Trades to Consider — "Consider trimming [X] from ___% to ___% and adding [Y] to reach ___% weight"
e) Missing Asset Classes — suggest specific low-cost ETFs for: International (VXUS), Emerging Markets (VWO), Small Cap (VB), REITs (VNQ), Commodities/Gold (GLD), TIPS (TIP), High Yield (HYG)

## SECTION 13: PORTFOLIO GRADE CARD
| Category                    | Grade | Comment |
|-----------------------------|-------|---------|
| Overall Diversification     |       |         |
| Risk Management             |       |         |
| Performance vs Benchmark    |       |         |
| Cost Efficiency             |       |         |
| Income Generation           |       |         |
| Tax Efficiency              |       |         |
| Sector Balance              |       |         |
| Geographic Diversification  |       |         |
| **OVERALL PORTFOLIO GRADE** |       |         |

## SECTION 14: EXECUTIVE SUMMARY
In 5-7 sentences: overall health, #1 strength, #1 weakness, the single most important thing to do right now, and a one-sentence outlook.

---
IMPORTANT DISCLAIMER: This analysis is for informational and educational purposes only. It does not constitute personalized financial advice, a recommendation to buy or sell any security, or a solicitation of any kind. Past performance does not guarantee future results. All investing involves risk, including the potential loss of principal. Consult a licensed financial advisor or CFA professional before making any investment decisions.
"""

# Legacy prompt kept for other uses
PORTFOLIO_INSIGHTS_PROMPT = PORTFOLIO_ANALYSIS_USER_PROMPT

# Retirement planning prompt
RETIREMENT_PLANNING_PROMPT = """
You are a retirement planning expert. Analyze the following retirement portfolio.

Retirement Account Summary:
- Current Balance: ${current_balance}
- Monthly Contribution: ${monthly_contribution}
- Expected Return: {expected_return}%
- Years to Retirement: {years_to_retirement}
- Current Age: {current_age}

Portfolio Holdings:
{holdings}

Please provide:
1. Retirement Readiness Assessment
2. Savings Rate Analysis
3. Investment Strategy Recommendations
4. Required Minimum Distribution Planning (if applicable)
5. Tax Strategy for Retirement

Keep the analysis concise but actionable (400-600 words).
"""

# Net worth analysis prompt
NET_WORTH_ANALYSIS_PROMPT = """
You are a wealth advisor. Analyze the following net worth profile.

Net Worth Summary:
- Total Assets: ${total_assets}
- Total Liabilities: ${total_liabilities}
- Net Worth: ${net_worth}
- Debt-to-Asset Ratio: {debt_to_asset_ratio}%

Asset Breakdown:
- Investments: ${investment_value} ({investment_percent}%)
- Real Estate: ${real_estate_value} ({real_estate_percent}%)
- Cash & Equivalents: ${cash_value} ({cash_percent}%)
- Retirement Accounts: ${retirement_value} ({retirement_percent}%)

Liability Breakdown:
- Mortgages: ${mortgage_value} ({mortgage_percent}%)
- Consumer Debt: ${consumer_debt_value} ({consumer_debt_percent}%)
- Other Liabilities: ${other_liabilities} ({other_liabilities_percent}%)

Please provide:
1. Overall Financial Health Assessment
2. Debt Management Recommendations
3. Asset Allocation Suggestions
4. Net Worth Growth Strategy
5. Emergency Fund Recommendations

Keep the analysis concise but actionable (400-600 words).
"""

# Tax optimization prompt
TAX_OPTIMIZATION_PROMPT = """
You are a tax efficiency expert. Analyze this taxable portfolio for tax efficiency.

Portfolio Details:
- Total Value: ${total_value}
- Realized Gains This Year: ${realized_gains}
- Capital Gains Distribution: ${capital_gains_dist}
- Dividend Income: ${dividend_income}

Taxable Account Holdings:
{holdings}

Please provide:
1. Tax Efficiency Assessment
2. Harvesting Opportunities
3. Location Advice (taxable vs tax-advantaged)
4. Dividend Strategy Optimization
5. Year-End Tax Planning Recommendations

Keep the analysis concise but actionable (400-600 words).
"""

# Market outlook prompt
MARKET_OUTLOOK_PROMPT = """
You are a market strategist. Provide a current market outlook.

Current Market Conditions:
- S&P 500: {sp500_level} ({sp500_change}%)
- 10-Year Treasury Yield: {treasury_yield}%
- Inflation Rate: {inflation_rate}%
- Fed Funds Rate: {fed_rate}%

Please provide:
1. Current Market Assessment
2. Sector Rotation Recommendations
3. Asset Allocation Guidance
4. Risk Management Suggestions
5. Investment Opportunities

Keep the analysis concise but informative (400-600 words).
"""

# Investment suggestions prompt
INVESTMENT_SUGGESTIONS_PROMPT = """
You are an investment advisor. Based on the following portfolio, suggest improvements.

Current Portfolio:
- Total Value: ${total_value}
- Risk Level: {risk_level}
- Investment Goals: {investment_goals}

Suggested Improvements:
1. Diversification Opportunities
2. Cost Reduction Strategies
3. Tax Efficiency Enhancements
4. Risk Management Tools

Please provide specific, actionable recommendations with reasoning.
Keep the analysis concise (300-500 words).
"""


def get_stock_analysis_prompt(
    ticker: str,
    company_name: str = None,
    price_data: dict = None,
) -> str:
    """Return the stock analysis user prompt for the given ticker, prepending live market data."""
    name = company_name or (price_data.get("company_name") if price_data else None) or ticker

    # Build a live-data preamble from whatever the market API returned
    if price_data:
        p = price_data
        prev_close = p.get("previous_close") or 0
        current = p.get("price") or 0
        day_chg = current - prev_close if prev_close else 0
        day_chg_pct = (day_chg / prev_close * 100) if prev_close else 0

        live_lines = [
            "## LIVE MARKET DATA (use these exact figures in Section 1 — do not invent or estimate them)",
            f"- Ticker: {ticker}",
            f"- Company: {name}",
        ]
        if p.get("sector"):
            live_lines.append(f"- Sector: {p['sector']}")
        if p.get("industry"):
            live_lines.append(f"- Industry: {p['industry']}")
        if current:
            live_lines.append(f"- Current Price: ${current:.2f}")
        if prev_close:
            live_lines.append(
                f"- Today's Change: {'+' if day_chg >= 0 else ''}${day_chg:.2f} "
                f"({'+' if day_chg_pct >= 0 else ''}{day_chg_pct:.2f}%)"
            )
        if p.get("open"):
            live_lines.append(f"- Open: ${p['open']:.2f}")
        if p.get("high") and p.get("low"):
            live_lines.append(f"- Today's High / Low: ${p['high']:.2f} / ${p['low']:.2f}")
        if p.get("volume"):
            live_lines.append(f"- Volume: {int(p['volume']):,}")
        if p.get("market_cap"):
            mc = p["market_cap"]
            mc_str = f"${mc/1e12:.2f}T" if mc >= 1e12 else f"${mc/1e9:.2f}B"
            live_lines.append(f"- Market Cap: {mc_str}")
        if p.get("pe_ratio"):
            live_lines.append(f"- P/E Ratio: {p['pe_ratio']:.2f}")
        if p.get("dividend_yield"):
            live_lines.append(f"- Dividend Yield: {p['dividend_yield']:.2f}%")
        if p.get("fifty_two_week_high") and p.get("fifty_two_week_low"):
            live_lines.append(
                f"- 52-Week High / Low: ${p['fifty_two_week_high']:.2f} / ${p['fifty_two_week_low']:.2f}"
            )

        preamble = "\n".join(live_lines) + "\n\n"
    else:
        preamble = ""

    return preamble + STOCK_ANALYSIS_USER_PROMPT.format(
        ticker=ticker,
        company_name=name,
    )


def get_portfolio_analysis_prompt(holdings: list) -> str:
    """
    Format holdings into the portfolio analysis user prompt with full detail.
    """
    total_value = sum(h.get("current_value") or 0 for h in holdings)
    total_cost  = sum((h.get("shares") or 0) * (h.get("average_cost") or 0) for h in holdings)
    total_gain  = total_value - total_cost

    lines = []
    for h in holdings:
        ticker        = h.get("ticker", "?")
        shares        = h.get("shares") or 0
        avg_cost      = h.get("average_cost") or h.get("avg_cost") or 0
        current_price = h.get("current_price") or 0
        current_value = h.get("current_value") or 0
        cost_basis    = shares * avg_cost
        gain          = current_value - cost_basis
        gain_pct      = (gain / cost_basis * 100) if cost_basis else 0
        alloc_pct     = (current_value / total_value * 100) if total_value else 0
        today_gain    = h.get("today_gain_loss") or 0
        today_pct     = h.get("today_gain_loss_percent") or 0
        sector        = h.get("sector") or "Unknown"
        industry      = h.get("industry") or ""
        sec_type      = h.get("security_type") or "stock"
        div_yield     = h.get("dividend_yield") or 0
        company       = h.get("security_name") or h.get("company_name") or ticker

        parts = [
            f"**{ticker}** ({company})",
            f"  Type: {sec_type.upper()}",
            f"  Sector: {sector}" + (f" / {industry}" if industry else ""),
            f"  Shares: {shares:g}  |  Avg Cost: ${avg_cost:.2f}  |  Current Price: ${current_price:.2f}",
            f"  Market Value: ${current_value:,.2f}  |  Portfolio Weight: {alloc_pct:.1f}%",
            f"  Unrealized G/L: {'+'if gain>=0 else ''}${gain:,.2f} ({'+' if gain_pct>=0 else ''}{gain_pct:.1f}%)",
            f"  Today's G/L: {'+'if today_gain>=0 else ''}${today_gain:,.2f} ({'+' if today_pct>=0 else ''}{today_pct:.2f}%)",
        ]
        if div_yield:
            parts.append(f"  Dividend Yield: {div_yield:.2f}%")
        lines.append("\n".join(parts))

    summary = (
        f"**Portfolio Summary**\n"
        f"  Total Market Value: ${total_value:,.2f}\n"
        f"  Total Cost Basis:   ${total_cost:,.2f}\n"
        f"  Total Unrealized G/L: {'+'if total_gain>=0 else ''}${total_gain:,.2f} "
        f"({'+' if total_gain/total_cost*100>=0 else ''}{total_gain/total_cost*100:.1f}% overall)\n"
        f"  Number of Positions: {len(holdings)}\n"
    ) if total_cost else ""

    holdings_text = summary + "\n---\n\n" + "\n\n".join(lines) if lines else "No holdings provided."
    return PORTFOLIO_ANALYSIS_USER_PROMPT.format(portfolio_holdings=holdings_text)


# Legacy alias kept for backward compatibility
def get_portfolio_insights_prompt(*args, **kwargs) -> str:
    return get_portfolio_analysis_prompt([])


def get_net_worth_analysis_prompt(
    total_assets: float,
    total_liabilities: float,
    net_worth: float,
    debt_to_asset_ratio: float,
    investment_value: float,
    investment_percent: float,
    real_estate_value: float,
    real_estate_percent: float,
    cash_value: float,
    cash_percent: float,
    retirement_value: float,
    retirement_percent: float,
    mortgage_value: float,
    mortgage_percent: float,
    consumer_debt_value: float,
    consumer_debt_percent: float,
    other_liabilities: float,
    other_liabilities_percent: float,
) -> str:
    """Get the net worth analysis prompt with parameters."""
    return NET_WORTH_ANALYSIS_PROMPT.format(
        total_assets=f"{total_assets:.2f}",
        total_liabilities=f"{total_liabilities:.2f}",
        net_worth=f"{net_worth:.2f}",
        debt_to_asset_ratio=f"{debt_to_asset_ratio:.2f}",
        investment_value=f"{investment_value:.2f}",
        investment_percent=f"{investment_percent:.2f}",
        real_estate_value=f"{real_estate_value:.2f}",
        real_estate_percent=f"{real_estate_percent:.2f}",
        cash_value=f"{cash_value:.2f}",
        cash_percent=f"{cash_percent:.2f}",
        retirement_value=f"{retirement_value:.2f}",
        retirement_percent=f"{retirement_percent:.2f}",
        mortgage_value=f"{mortgage_value:.2f}",
        mortgage_percent=f"{mortgage_percent:.2f}",
        consumer_debt_value=f"{consumer_debt_value:.2f}",
        consumer_debt_percent=f"{consumer_debt_percent:.2f}",
        other_liabilities=f"{other_liabilities:.2f}",
        other_liabilities_percent=f"{other_liabilities_percent:.2f}",
    )
