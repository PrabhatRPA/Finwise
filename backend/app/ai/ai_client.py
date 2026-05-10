"""
Personal Finance Platform - Unified AI Client
Supports Claude (Anthropic), OpenAI, Ollama, and LM Studio behind one interface.
Switch providers via AI_PROVIDER in backend/.env, or call reconfigure() at runtime.
"""

import logging
from datetime import datetime

from app.core.config import (
    AI_PROVIDER, AI_TIMEOUT,
    CLAUDE_API_KEY, CLAUDE_MODEL,
    OPENAI_API_KEY, OPENAI_MODEL,
    OLLAMA_HOST, OLLAMA_MODEL,
    LMSTUDIO_HOST, LMSTUDIO_MODEL,
)

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM = "You are a helpful personal finance assistant with expertise in investments, stocks, and financial planning."

VALID_PROVIDERS = {"claude", "openai", "ollama", "lmstudio"}


class AIClient:
    """Unified AI client wrapping Claude, OpenAI, Ollama, and LM Studio."""

    def __init__(self, provider: str = None):
        self.provider = (provider or AI_PROVIDER).lower()
        # Per-provider credentials — can be updated at runtime via reconfigure()
        self._claude_key = CLAUDE_API_KEY
        self._claude_model = CLAUDE_MODEL
        self._openai_key = OPENAI_API_KEY
        self._openai_model = OPENAI_MODEL
        self._ollama_host = OLLAMA_HOST
        self._ollama_model = OLLAMA_MODEL
        self._lmstudio_host = LMSTUDIO_HOST
        self._lmstudio_model = LMSTUDIO_MODEL

    # ── Runtime reconfiguration ───────────────────────────────────

    def reconfigure(
        self,
        provider: str,
        api_key: str = None,
        model: str = None,
        host: str = None,
    ) -> None:
        """Update provider and credentials without restarting the server."""
        self.provider = provider.lower()
        if provider == "claude":
            if api_key is not None:
                self._claude_key = api_key
            if model:
                self._claude_model = model
        elif provider == "openai":
            if api_key is not None:
                self._openai_key = api_key
            if model:
                self._openai_model = model
        elif provider == "ollama":
            if host:
                self._ollama_host = host
            if model:
                self._ollama_model = model
        elif provider == "lmstudio":
            if host:
                self._lmstudio_host = host
            if model:
                self._lmstudio_model = model

    def get_settings(self) -> dict:
        """Return current settings (never exposes full API keys)."""
        return {
            "provider": self.provider,
            "claude_model": self._claude_model,
            "claude_api_key_set": bool(self._claude_key),
            "openai_model": self._openai_model,
            "openai_api_key_set": bool(self._openai_key),
            "ollama_host": self._ollama_host,
            "ollama_model": self._ollama_model,
            "lmstudio_host": self._lmstudio_host,
            "lmstudio_model": self._lmstudio_model,
        }

    # ── Public interface ──────────────────────────────────────────

    def generate(
        self,
        prompt: str,
        system_prompt: str = None,
        temperature: float = 0.7,
    ) -> dict:
        """
        Generate a text response.
        Returns {"response": str, "model": str, "provider": str, "timestamp": str}.
        On error also includes {"error": str}.
        """
        system = system_prompt or DEFAULT_SYSTEM
        try:
            if self.provider == "claude":
                return self._claude(prompt, system, temperature)
            elif self.provider == "openai":
                return self._openai(prompt, system, temperature)
            elif self.provider == "lmstudio":
                return self._lmstudio(prompt, system, temperature)
            else:
                return self._ollama(prompt, system, temperature)
        except Exception as e:
            logger.error(f"[AIClient/{self.provider}] generate error: {e}")
            return {
                "error": str(e),
                "response": "",
                "provider": self.provider,
                "model": self._model_name(),
                "timestamp": datetime.now().isoformat(),
            }

    def is_available(self) -> bool:
        try:
            if self.provider == "claude":
                return bool(self._claude_key)
            elif self.provider == "openai":
                return bool(self._openai_key)
            elif self.provider == "lmstudio":
                return self._lmstudio_ping()
            else:
                return self._ollama_ping()
        except Exception:
            return False

    def provider_info(self) -> dict:
        return {"provider": self.provider, "model": self._model_name()}

    # ── Claude ────────────────────────────────────────────────────

    def _claude(self, prompt: str, system: str, temperature: float) -> dict:
        import anthropic
        client = anthropic.Anthropic(api_key=self._claude_key)
        msg = client.messages.create(
            model=self._claude_model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
        )
        text = msg.content[0].text if msg.content else ""
        return {
            "response": text,
            "model": self._claude_model,
            "provider": "claude",
            "timestamp": datetime.now().isoformat(),
        }

    # ── OpenAI ───────────────────────────────────────────────────

    def _openai(self, prompt: str, system: str, temperature: float) -> dict:
        from openai import OpenAI
        client = OpenAI(api_key=self._openai_key)
        resp = client.chat.completions.create(
            model=self._openai_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
        )
        text = resp.choices[0].message.content if resp.choices else ""
        return {
            "response": text,
            "model": self._openai_model,
            "provider": "openai",
            "timestamp": datetime.now().isoformat(),
        }

    # ── LM Studio (OpenAI-compatible) ────────────────────────────

    def _lmstudio(self, prompt: str, system: str, temperature: float) -> dict:
        from openai import OpenAI
        client = OpenAI(api_key="lm-studio", base_url=f"{self._lmstudio_host}/v1")
        resp = client.chat.completions.create(
            model=self._lmstudio_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
        )
        text = resp.choices[0].message.content if resp.choices else ""
        return {
            "response": text,
            "model": self._lmstudio_model,
            "provider": "lmstudio",
            "timestamp": datetime.now().isoformat(),
        }

    def _lmstudio_ping(self) -> bool:
        try:
            import requests
            r = requests.get(f"{self._lmstudio_host}/v1/models", timeout=3)
            return r.status_code == 200
        except Exception:
            return False

    # ── Ollama ───────────────────────────────────────────────────

    def _ollama(self, prompt: str, system: str, temperature: float) -> dict:
        import re
        import ollama as _ollama
        client = _ollama.Client(host=self._ollama_host, timeout=AI_TIMEOUT)
        response = client.generate(
            model=self._ollama_model,
            prompt=prompt,
            system=system,
            options={"temperature": temperature},
        )
        if hasattr(response, "response"):
            text = response.response
        elif isinstance(response, dict):
            text = response.get("response", "")
        else:
            text = ""
        # Strip <think>…</think> blocks from reasoning models
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
        return {
            "response": text,
            "model": self._ollama_model,
            "provider": "ollama",
            "timestamp": datetime.now().isoformat(),
        }

    def _ollama_ping(self) -> bool:
        try:
            import ollama as _ollama
            client = _ollama.Client(host=self._ollama_host)
            resp = client.list()
            if hasattr(resp, "models"):
                return bool(resp.models)
            return bool(resp.get("models"))
        except Exception:
            return False

    # ── Helpers ───────────────────────────────────────────────────

    def _model_name(self) -> str:
        return {
            "claude": self._claude_model,
            "openai": self._openai_model,
            "lmstudio": self._lmstudio_model,
            "ollama": self._ollama_model,
        }.get(self.provider, self._ollama_model)


# Singleton — reconfigure() updates this instance live without a server restart.
ai_client = AIClient()
