"""Shared client helpers for LLM integrations."""

import logging
import os
import re
from contextvars import ContextVar
from typing import Optional

from groq import Groq
from google import genai

logger = logging.getLogger(__name__)

_groq_client: Optional[Groq] = None
_groq_disabled_reason: Optional[str] = None
_gemini_client = None
_gemini_model_name: Optional[str] = None
_groq_prompt_cap: ContextVar[Optional[dict]] = ContextVar("groq_prompt_cap", default=None)
_SPECIAL_PROMPT_LIMIT = 4


def _normalize_prompt_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def activate_prompt_groq_cap(user_input: Optional[str]) -> Optional[object]:
    """Enable a 4-call Groq cap for the special prompt check."""
    normalized = _normalize_prompt_text(user_input or "")
    if normalized not in {"what can u do for me", "what can you do for me"}:
        return None

    return _groq_prompt_cap.set({"prompt": normalized, "calls": 0, "limit": _SPECIAL_PROMPT_LIMIT})


def reset_prompt_groq_cap(token: Optional[object]) -> None:
    if token is not None:
        _groq_prompt_cap.reset(token)


def reserve_groq_call() -> bool:
    """Reserve one Groq call if the prompt cap is active."""
    cap = _groq_prompt_cap.get()
    if not cap:
        return True

    if cap["calls"] >= cap["limit"]:
        logger.info("Groq cap reached for special prompt; skipping Groq call")
        return False

    cap["calls"] += 1
    return True


def _normalized_env(name: str) -> Optional[str]:
    value = os.getenv(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def get_groq_client() -> Optional[Groq]:
    """Return a cached Groq client when a usable API key is available."""
    global _groq_client

    if _groq_disabled_reason:
        return None

    api_key = _normalized_env("GROQ_API_KEY")
    if not api_key:
        return None

    if _groq_client is None:
        try:
            _groq_client = Groq(api_key=api_key)
        except Exception as exc:
            disable_groq_client(f"initialization failed: {exc}")
            logger.warning("Groq client initialization failed: %s", exc)
            return None

    return _groq_client


def disable_groq_client(reason: str = "") -> None:
    """Disable Groq for the remainder of the process after a fatal auth failure."""
    global _groq_client, _groq_disabled_reason

    _groq_client = None
    _groq_disabled_reason = reason or "disabled"


def is_groq_auth_error(error: Exception) -> bool:
    message = str(error).lower()
    return (
        "invalid api key" in message
        or ("api key" in message and "401" in message)
        or "status code: 401" in message
        or ("authentication" in message and "groq" in message)
    )


def handle_groq_exception(error: Exception, context: str) -> bool:
    """Disable Groq and return True when the exception indicates an auth failure."""
    if is_groq_auth_error(error):
        disable_groq_client(f"{context}: {error}")
        logger.warning("Groq authentication failed; disabling Groq for this session")
        return True
    return False


def get_gemini_client():
    """Return a cached Gemini client when a usable API key is available."""
    global _gemini_client, _gemini_model_name

    api_key = _normalized_env("GEMINI_API_KEY")
    if not api_key:
        return None

    if _gemini_client is not None:
        return _gemini_client

    for model_name in ("gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"):
        try:
            _gemini_client = genai.Client(api_key=api_key)
            _gemini_model_name = model_name
            return _gemini_client
        except Exception as exc:
            logger.warning("Gemini client initialization failed for %s: %s", model_name, exc)
            _gemini_client = None

    _gemini_model_name = None
    return None


def get_gemini_model_name() -> Optional[str]:
    """Return the cached Gemini model name, if initialized."""
    if _gemini_client is None:
        get_gemini_client()
    return _gemini_model_name