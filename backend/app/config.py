"""Centralized configuration for Aura AI backend"""

import os
from dotenv import load_dotenv

load_dotenv()

# ==================== LLM Configuration ====================
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Models
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

# LLM Parameters
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", "0.2"))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "1024"))
LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT", "30"))

# ==================== Search Configuration ====================
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
TAVILY_SEARCH_DEPTH = os.getenv("TAVILY_SEARCH_DEPTH", "advanced")
TAVILY_MAX_RESULTS = int(os.getenv("TAVILY_MAX_RESULTS", "10"))

# Google Search API (fallback, currently unused)
GOOGLE_SEARCH_API_KEY = os.getenv("GOOGLE_SEARCH_API_KEY")
GOOGLE_SEARCH_ENGINE_ID = os.getenv("GOOGLE_SEARCH_ENGINE_ID")

# ==================== Analysis Pipeline Configuration ====================
MAX_CLAIMS_TO_ANALYZE = int(os.getenv("MAX_CLAIMS_TO_ANALYZE", "5"))
MAX_SEARCH_RESULTS = int(os.getenv("MAX_SEARCH_RESULTS", "20"))

# Input validation
MAX_QUERY_LENGTH = int(os.getenv("MAX_QUERY_LENGTH", "2000"))
MAX_IMAGES = int(os.getenv("MAX_IMAGES", "5"))
ALLOWED_MODES = ["verify", "research", "mixed"]

# ==================== Response Configuration ====================
VERDICT_LABELS = {
    "true": "TRUE",
    "likely_true": "LIKELY TRUE",
    "misleading": "MISLEADING",
    "likely_fake": "LIKELY FAKE",
    "fake": "FAKE",
    "unverified": "UNVERIFIED",
}

# ==================== Logging Configuration ====================
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# ==================== Server Configuration ====================
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
API_RELOAD = os.getenv("API_RELOAD", "true").lower() == "true"

# ==================== CORS Configuration ====================
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000").split(",")
