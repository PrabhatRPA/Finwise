"""
Personal Finance Platform - Insights Prompts
Prompts for generating financial insights and recommendations
"""

# General insights prompt
INSIGHTS_PROMPT = """
You are a personal finance expert. Based on the following portfolio data, provide actionable financial insights.

Portfolio Data:
{portfolio_data}

Please analyze:
1. Diversification and asset allocation
2. Cost efficiency and fees
3. Tax efficiency
4. Risk management
5. Growth opportunities

Provide 3-5 specific, actionable recommendations with reasoning.
Keep the response concise and focused on actionable advice (300-500 words).
"""

# Risk assessment prompt
RISK_ASSESSMENT_PROMPT = """
You are a risk management expert. Assess the risk profile of this portfolio.

Portfolio Risk Factors:
- Total Value: ${total_value}
- Stock Exposure: {stock_percentage}%
- Sector Concentration: {sector_concentration}
- Geographical Exposure: {geographical_exposure}
- Volatility History: {volatility_history}

Please assess:
1. Overall Risk Level (Low/Medium/High)
2. Risk Concentration Areas
3. Stress Test Scenarios
4. Risk Mitigation Strategies
5. Suitability for Investment Goals

Keep the response concise (200-400 words).
"""

# Diversification analysis prompt
DIVERSIFICATION_PROMPT = """
You are a portfolio construction expert. Analyze the diversification of this portfolio.

Current Portfolio:
- Total Holdings: {num_holdings}
- Sector Breakdown: {sector_breakdown}
- Geographic Breakdown: {geo_breakdown}
- Asset Types: {asset_types}

Please provide:
1. Diversification Score (out of 10)
2. Concentration Risks Identified
3. Sector/Industry Gaps
4. Recommended Additions for Better Diversification
5. Worst-Case Scenario Analysis

Keep the response concise (200-400 words).
"""

# Tax efficiency prompt
TAX_STRATEGY_PROMPT = """
You are a tax optimization expert. Analyze tax efficiency of this portfolio.

Taxable Account Details:
- Total Value: ${total_value}
- Cost Basis: ${cost_basis}
- Unrealized Gains: ${unrealized_gains}
- Dividend Yield: {dividend_yield}%
- Turnover Rate: {turnover_rate}%

Please provide:
1. Tax Efficiency Rating
2. Tax-Loss Harvesting Opportunities
3. Asset Location Recommendations
4. Dividend Strategy Optimization
5. Year-End Tax Planning Actions

Keep the response concise (200-400 words).
"""

# Rebalancing recommendation prompt
REBALANCING_PROMPT = """
You are a portfolio rebalancing expert. Recommend rebalancing actions.

Current Portfolio vs Target:
- Current Allocation: {current_allocation}
- Target Allocation: {target_allocation}
- Deviation Threshold: {deviation_threshold}

Please recommend:
1. Rebalancing Necessity (Immediate/Review/No Action)
2. Specific Actions to Rebalance
3. Tax Implications of Rebalancing
4. Timing Recommendations
5. Dollar-Cost Averaging Suggestions

Keep the response concise (200-400 words).
"""


def get_insights_prompt(portfolio_data: str) -> str:
    """Get the general insights prompt with portfolio data."""
    return INSIGHTS_PROMPT.format(portfolio_data=portfolio_data)


def get_risk_assessment_prompt(
    total_value: float,
    stock_percentage: float,
    sector_concentration: str,
    geographical_exposure: str,
    volatility_history: str,
) -> str:
    """Get the risk assessment prompt with parameters."""
    return RISK_ASSESSMENT_PROMPT.format(
        total_value=f"{total_value:.2f}",
        stock_percentage=f"{stock_percentage:.2f}",
        sector_concentration=sector_concentration,
        geographical_exposure=geographical_exposure,
        volatility_history=volatility_history,
    )


def get_diversification_prompt(
    num_holdings: int,
    sector_breakdown: str,
    geo_breakdown: str,
    asset_types: str,
) -> str:
    """Get the diversification prompt with parameters."""
    return DIVERSIFICATION_PROMPT.format(
        num_holdings=num_holdings,
        sector_breakdown=sector_breakdown,
        geo_breakdown=geo_breakdown,
        asset_types=asset_types,
    )


def get_tax_strategy_prompt(
    total_value: float,
    cost_basis: float,
    unrealized_gains: float,
    dividend_yield: float,
    turnover_rate: float,
) -> str:
    """Get the tax strategy prompt with parameters."""
    return TAX_STRATEGY_PROMPT.format(
        total_value=f"{total_value:.2f}",
        cost_basis=f"{cost_basis:.2f}",
        unrealized_gains=f"{unrealized_gains:.2f}",
        dividend_yield=f"{dividend_yield:.2f}",
        turnover_rate=f"{turnover_rate:.2f}",
    )


def get_rebalancing_prompt(
    current_allocation: str,
    target_allocation: str,
    deviation_threshold: float,
) -> str:
    """Get the rebalancing prompt with parameters."""
    return REBALANCING_PROMPT.format(
        current_allocation=current_allocation,
        target_allocation=target_allocation,
        deviation_threshold=f"{deviation_threshold:.2f}",
    )
