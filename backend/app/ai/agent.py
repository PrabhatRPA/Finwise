"""
Personal Finance Platform - AI Agent Orchestrator
Coordinates multiple AI agents for financial analysis
"""

import json
import logging
from typing import Optional, Dict, List, Any
from datetime import datetime

from app.ai.ai_client import ai_client
from app.ai.prompts import extraction_prompts, insights_prompts
from app.ai.prompts import analysis_prompts
from app.ai.prompts.analysis_prompts import (
    STOCK_ANALYSIS_SYSTEM_PROMPT,
    PORTFOLIO_ANALYSIS_SYSTEM_PROMPT,
    get_stock_analysis_prompt,
    get_portfolio_analysis_prompt,
)

logger = logging.getLogger(__name__)


class AIAgent:
    """Base AI agent class."""

    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description

    def generate_response(self, prompt: str, system_prompt: str = None) -> Dict[str, Any]:
        """Generate a response using the configured AI provider."""
        return ai_client.generate(prompt=prompt, system_prompt=system_prompt)


class PortfolioAnalysisAgent(AIAgent):
    """Agent for portfolio analysis and insights."""

    def __init__(self):
        super().__init__(
            "Portfolio Analysis Agent",
            "Analyzes investment portfolios and provides insights"
        )

    def analyze_portfolio(self, portfolio_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze a complete portfolio using the professional portfolio analysis prompt."""
        holdings = portfolio_data.get("holdings", [])
        prompt = get_portfolio_analysis_prompt(holdings)
        response = self.generate_response(prompt, system_prompt=PORTFOLIO_ANALYSIS_SYSTEM_PROMPT)
        return {
            "analysis": response.get("response", ""),
            "model": response.get("model", ""),
            "timestamp": datetime.now().isoformat(),
        }


class StockAnalysisAgent(AIAgent):
    """Agent for individual stock analysis."""

    def __init__(self):
        super().__init__(
            "Stock Analysis Agent",
            "Analyzes individual stocks and provides investment recommendations"
        )

    def analyze_stock(
        self,
        ticker: str,
        company_name: str = None,
        price_data: Dict = None,
    ) -> Dict[str, Any]:
        """Analyze a single stock using the comprehensive 12-section analyst prompt."""
        prompt = get_stock_analysis_prompt(
            ticker=ticker,
            company_name=company_name,
        )
        response = self.generate_response(prompt, system_prompt=STOCK_ANALYSIS_SYSTEM_PROMPT)
        return {
            "ticker": ticker,
            "analysis": response.get("response", ""),
            "model": response.get("model", ""),
            "timestamp": datetime.now().isoformat(),
        }


class DocumentExtractionAgent(AIAgent):
    """Agent for extracting data from financial documents."""

    def __init__(self):
        super().__init__(
            "Document Extraction Agent",
            "Extracts investment data from PDF documents"
        )

    def extract_from_document(self, document_text: str, document_type: str = "brokerage") -> Dict[str, Any]:
        """Extract data from a financial document."""
        if document_type == "1099_b":
            prompt = extraction_prompts.get_1099_b_extraction_prompt(document_text)
        elif document_type == "1099_div":
            prompt = extraction_prompts.get_1099_div_extraction_prompt(document_text)
        else:
            prompt = extraction_prompts.get_portfolio_extraction_prompt(document_text)

        response = self.generate_response(prompt)

        # Try to parse JSON response
        try:
            extracted_data = json.loads(response.get("response", "[]"))
        except json.JSONDecodeError:
            extracted_data = {"raw_text": response.get("response", "")}

        return {
            "extracted_data": extracted_data,
            "model": response.get("model", ""),
            "timestamp": datetime.now().isoformat(),
        }


class MarketInsightsAgent(AIAgent):
    """Agent for market analysis and insights."""

    def __init__(self):
        super().__init__(
            "Market Insights Agent",
            "Provides market analysis and investment insights"
        )

    def get_market_outlook(self) -> Dict[str, Any]:
        """Get current market outlook."""
        prompt = analysis_prompts.MARKET_OUTLOOK_PROMPT

        response = self.generate_response(prompt)

        return {
            "market_outlook": response.get("response", ""),
            "model": response.get("model", ""),
            "timestamp": datetime.now().isoformat(),
        }

    def get_investment_suggestions(self, portfolio_data: Dict[str, Any]) -> Dict[str, Any]:
        """Get investment suggestions based on portfolio."""
        prompt = insights_prompts.get_insights_prompt(json.dumps(portfolio_data, indent=2))

        response = self.generate_response(prompt)

        return {
            "suggestions": response.get("response", ""),
            "model": response.get("model", ""),
            "timestamp": datetime.now().isoformat(),
        }


class RiskAssessmentAgent(AIAgent):
    """Agent for portfolio risk assessment."""

    def __init__(self):
        super().__init__(
            "Risk Assessment Agent",
            "Assesses portfolio risk and provides mitigation strategies"
        )

    def assess_risk(self, portfolio_data: Dict[str, Any]) -> Dict[str, Any]:
        """Assess portfolio risk."""
        prompt = insights_prompts.get_risk_assessment_prompt(
            total_value=portfolio_data.get("total_value", 0),
            stock_percentage=portfolio_data.get("stock_percentage", 0),
            sector_concentration=portfolio_data.get("sector_concentration", "Unknown"),
            geographical_exposure=portfolio_data.get("geographical_exposure", "Unknown"),
            volatility_history=portfolio_data.get("volatility_history", "Unknown"),
        )

        response = self.generate_response(prompt)

        return {
            "risk_assessment": response.get("response", ""),
            "model": response.get("model", ""),
            "timestamp": datetime.now().isoformat(),
        }


class AIOrchestrator:
    """Orchestrates multiple AI agents for comprehensive financial analysis."""

    def __init__(self):
        self.agents = {
            "portfolio_analysis": PortfolioAnalysisAgent(),
            "stock_analysis": StockAnalysisAgent(),
            "document_extraction": DocumentExtractionAgent(),
            "market_insights": MarketInsightsAgent(),
            "risk_assessment": RiskAssessmentAgent(),
        }

    def get_agent(self, name: str) -> Optional[AIAgent]:
        """Get an agent by name."""
        return self.agents.get(name)

    def analyze_portfolio(self, portfolio_data: Dict[str, Any]) -> Dict[str, Any]:
        """Run comprehensive portfolio analysis."""
        results = {}

        # Run all relevant analyses
        for name, agent in self.agents.items():
            try:
                if name == "portfolio_analysis":
                    results[name] = agent.analyze_portfolio(portfolio_data)
                elif name == "risk_assessment":
                    results[name] = agent.assess_risk(portfolio_data)
                elif name == "market_insights":
                    results[name] = agent.get_investment_suggestions(portfolio_data)
            except Exception as e:
                logger.error(f"Error running {name}: {e}")
                results[name] = {"error": str(e)}

        return results

    def analyze_stock(self, ticker: str, stock_data: Dict = None) -> Dict[str, Any]:
        """Analyze a single stock using the stock analysis agent."""
        agent = self.agents.get("stock_analysis")
        if agent:
            return agent.analyze_stock(ticker, stock_data.get("company_name"), stock_data)
        return {"error": "Stock analysis agent not available"}

    def extract_document_data(self, document_text: str, document_type: str = "brokerage") -> Dict[str, Any]:
        """Extract data from a document using the extraction agent."""
        agent = self.agents.get("document_extraction")
        if agent:
            return agent.extract_from_document(document_text, document_type)
        return {"error": "Document extraction agent not available"}


# Singleton instance
ai_orchestrator = AIOrchestrator()
