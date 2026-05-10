"""
Personal Finance Platform - AI API
Endpoints for AI-driven analysis and insights
"""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional, Dict

from app.db import get_db
from app.db import models
from app.ai import agent
from app.ai.ai_client import ai_client, VALID_PROVIDERS
from app.services import market_service

router = APIRouter()


# ── Settings helpers ──────────────────────────────────────────────

def _update_env_file(updates: dict) -> None:
    """Write key=value pairs into backend/.env, preserving all other lines."""
    from app.core.config import BASE_DIR
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    lines = env_path.read_text().splitlines()
    pending = dict(updates)
    new_lines = []
    for line in lines:
        if "=" in line and not line.lstrip().startswith("#"):
            key = line.split("=", 1)[0].strip()
            if key in pending:
                val = pending.pop(key)
                if val is not None:
                    new_lines.append(f"{key}={val}")
                    continue
        new_lines.append(line)
    # Append any keys that weren't already in the file
    for key, val in pending.items():
        if val is not None:
            new_lines.append(f"{key}={val}")
    env_path.write_text("\n".join(new_lines) + "\n")


class AISettingsUpdate(BaseModel):
    provider: str
    api_key: Optional[str] = None   # cloud providers: Claude, OpenAI
    model: Optional[str] = None
    host: Optional[str] = None      # local providers: Ollama, LM Studio


class StockAnalysisRequest(BaseModel):
    ticker: str
    company_name: Optional[str] = None


@router.get("/ai/check")
async def check_ai():
    """Check if AI/LLM service is available."""
    info = ai_client.provider_info()
    return {
        "available": ai_client.is_available(),
        "provider": info["provider"],
        "model": info["model"],
    }


@router.post("/ai/portfolio-analysis")
async def analyze_portfolio(holdings_data: List[Dict]):
    """Get AI portfolio analysis. Returns {"analysis": "..."}."""
    if not holdings_data:
        raise HTTPException(status_code=400, detail="No holdings provided")

    portfolio_agent = agent.PortfolioAnalysisAgent()
    result = portfolio_agent.analyze_portfolio({
        "holdings": holdings_data,
        "total_value": sum(h.get("total_value", h.get("current_value", 0)) for h in holdings_data),
        "num_holdings": len(holdings_data),
    })
    # Always return a flat {"analysis": "..."} so the frontend can do response.data.analysis
    return {"analysis": result.get("analysis", ""), "model": result.get("model", "")}


@router.post("/ai/stock-analysis")
async def analyze_stock(request: StockAnalysisRequest):
    """Get AI analysis for a specific stock. Returns {"analysis": "..."}."""
    ticker = request.ticker.upper()
    price_data = market_service.get_current_price(ticker)

    analysis_agent = agent.StockAnalysisAgent()
    result = analysis_agent.analyze_stock(
        ticker=ticker,
        company_name=request.company_name,
        price_data=price_data,
    )
    return {
        "ticker": ticker,
        "analysis": result.get("analysis", ""),
        "model": result.get("model", ""),
        "price_data": price_data,
    }


@router.post("/ai/document-extraction")
async def extract_document_data(
    document_text: str,
    document_type: str = "brokerage",
):
    """Extract investment data from a document using AI."""
    if not document_text:
        raise HTTPException(status_code=400, detail="No document text provided")

    orchestrator = agent.AIOrchestrator()
    result = orchestrator.extract_document_data(document_text, document_type)

    return result


@router.get("/ai/market-insights")
async def get_market_insights():
    """Get AI-generated market insights."""
    orchestrator = agent.AIOrchestrator()
    insights = orchestrator.get_agent("market_insights").get_market_outlook()

    return insights


@router.post("/ai/risk-assessment")
async def assess_risk(
    portfolio_data: Dict,
):
    """Get AI-generated risk assessment for a portfolio."""
    if not portfolio_data:
        raise HTTPException(status_code=400, detail="No portfolio data provided")

    orchestrator = agent.AIOrchestrator()
    assessment = orchestrator.assess_risk(portfolio_data)

    return assessment


@router.post("/ai/investment-suggestions")
async def get_suggestions(
    portfolio_data: Dict,
):
    """Get AI-generated investment suggestions."""
    if not portfolio_data:
        raise HTTPException(status_code=400, detail="No portfolio data provided")

    orchestrator = agent.AIOrchestrator()
    suggestions = orchestrator.get_agent("market_insights").get_investment_suggestions(portfolio_data)

    return suggestions


@router.get("/ai/health")
async def ai_health():
    """Health check for AI services."""
    from datetime import datetime
    info = ai_client.provider_info()
    return {
        "status": "healthy" if ai_client.is_available() else "unavailable",
        "provider": info["provider"],
        "model": info["model"],
        "timestamp": datetime.now().isoformat(),
    }


# ── Provider settings ─────────────────────────────────────────────

@router.get("/ai/settings")
async def get_ai_settings():
    """Return current AI provider settings. API keys are never returned in full."""
    return ai_client.get_settings()


@router.post("/ai/settings")
async def update_ai_settings(body: AISettingsUpdate):
    """
    Switch AI provider and credentials at runtime.
    Changes take effect immediately and are persisted to backend/.env.
    """
    if body.provider not in VALID_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider '{body.provider}'. Choose from: {', '.join(sorted(VALID_PROVIDERS))}",
        )

    ai_client.reconfigure(
        provider=body.provider,
        api_key=body.api_key,
        model=body.model,
        host=body.host,
    )

    # Persist to .env so the setting survives a server restart
    env_updates: dict = {"AI_PROVIDER": body.provider}
    if body.provider == "claude":
        if body.api_key:
            env_updates["CLAUDE_API_KEY"] = body.api_key
        if body.model:
            env_updates["CLAUDE_MODEL"] = body.model
    elif body.provider == "openai":
        if body.api_key:
            env_updates["OPENAI_API_KEY"] = body.api_key
        if body.model:
            env_updates["OPENAI_MODEL"] = body.model
    elif body.provider == "ollama":
        if body.host:
            env_updates["OLLAMA_HOST"] = body.host
        if body.model:
            env_updates["OLLAMA_MODEL"] = body.model
    elif body.provider == "lmstudio":
        if body.host:
            env_updates["LMSTUDIO_HOST"] = body.host
        if body.model:
            env_updates["LMSTUDIO_MODEL"] = body.model

    _update_env_file(env_updates)

    return {"ok": True, **ai_client.get_settings()}
