"""
Personal Finance Platform - Ollama Client
Interface to local LLMs via Ollama API
"""

import os
import logging
from typing import Optional, Dict, List, Any
from datetime import datetime

import ollama

from app.core.config import OLLAMA_HOST, OLLAMA_MODEL, OLLAMA_TIMEOUT

logger = logging.getLogger(__name__)


class OllamaClient:
    """Client for Ollama local LLM API."""

    def __init__(
        self,
        host: str = None,
        model: str = None,
        timeout: int = None,
    ):
        self.host = host or OLLAMA_HOST
        self.model = model or OLLAMA_MODEL
        self.timeout = timeout or OLLAMA_TIMEOUT

        # Initialize Ollama client
        self.client = ollama.Client(host=self.host, timeout=self.timeout)

    def generate(
        self,
        prompt: str,
        model: str = None,
        system_prompt: str = None,
        temperature: float = 0.7,
        stream: bool = False,
    ) -> Dict[str, Any]:
        """
        Generate text using the LLM.

        Args:
            prompt: User prompt
            model: Model name (uses default if None)
            system_prompt: System prompt to set context
            temperature: Sampling temperature
            stream: Whether to stream responses

        Returns:
            Dictionary with response and metadata
        """
        try:
            response = self.client.generate(
                model=model or self.model,
                prompt=prompt,
                system=system_prompt or "You are a helpful financial assistant.",
                options={"temperature": temperature},
                stream=stream,
            )

            return {
                "response": response.get("response", ""),
                "model": response.get("model", self.model),
                "done": response.get("done", True),
                "total_duration": response.get("total_duration", 0),
                "load_duration": response.get("load_duration", 0),
                "prompt_eval_count": response.get("prompt_eval_count", 0),
                "eval_count": response.get("eval_count", 0),
                "eval_duration": response.get("eval_duration", 0),
                "timestamp": datetime.now().isoformat(),
            }

        except Exception as e:
            logger.error(f"Error generating with Ollama: {e}")
            return {
                "error": str(e),
                "response": None,
                "timestamp": datetime.now().isoformat(),
            }

    def chat(
        self,
        messages: List[Dict[str, str]],
        model: str = None,
        temperature: float = 0.7,
    ) -> Dict[str, Any]:
        """
        Chat with the LLM using message format.

        Args:
            messages: List of message dictionaries with 'role' and 'content'
            model: Model name (uses default if None)
            temperature: Sampling temperature

        Returns:
            Dictionary with response and metadata
        """
        try:
            response = self.client.chat(
                model=model or self.model,
                messages=messages,
                options={"temperature": temperature},
            )

            return {
                "response": response.get("message", {}).get("content", ""),
                "model": response.get("model", self.model),
                "done": response.get("done", True),
                "timestamp": datetime.now().isoformat(),
            }

        except Exception as e:
            logger.error(f"Error chatting with Ollama: {e}")
            return {
                "error": str(e),
                "response": None,
                "timestamp": datetime.now().isoformat(),
            }

    def embeddings(self, text: str, model: str = None) -> List[float]:
        """
        Generate embeddings for text.

        Args:
            text: Text to generate embeddings for
            model: Model name (uses default if None)

        Returns:
            List of embedding values
        """
        try:
            response = self.client.embeddings(
                model=model or self.model,
                prompt=text,
            )

            return response.get("embedding", [])

        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            return []

    def is_available(self) -> bool:
        """Check if Ollama service is available."""
        try:
            response = self.client.list()
            return bool(response.get("models", []))
        except Exception as e:
            logger.error(f"Ollama service check failed: {e}")
            return False

    def list_models(self) -> List[str]:
        """List available models in Ollama."""
        try:
            response = self.client.list()
            models = response.get("models", [])
            return [m.get("name", "") for m in models]
        except Exception as e:
            logger.error(f"Error listing Ollama models: {e}")
            return []


# Singleton instance
ollama_client = OllamaClient()
