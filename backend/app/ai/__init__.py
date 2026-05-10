"""
Personal Finance Platform - AI Package
Multi-provider LLM integration for financial analysis (Claude, OpenAI, Ollama, LM Studio)
"""

from .ollama_client import OllamaClient
from .prompts import analysis_prompts, extraction_prompts, insights_prompts

__all__ = ["OllamaClient", "analysis_prompts", "extraction_prompts", "insights_prompts"]
