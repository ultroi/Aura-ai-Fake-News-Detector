"""Web search handler for retrieving fact-checking sources"""

import os
import logging
import aiohttp
from typing import Optional

logger = logging.getLogger(__name__)

# API configurations
GOOGLE_SEARCH_API_KEY = os.getenv("GOOGLE_SEARCH_API_KEY")
GOOGLE_SEARCH_ENGINE_ID = os.getenv("GOOGLE_SEARCH_ENGINE_ID")
SERPAPI_KEY = os.getenv("SERPAPI_KEY")

GOOGLE_SEARCH_URL = "https://www.googleapis.com/customsearch/v1"
SERPAPI_URL = "https://serpapi.com/search"


async def search(query: str) -> list:
    """
    Search for sources related to a claim (tries Google Search first, then SerpAPI).

    Args:
        query: The claim to search for

    Returns:
        List of search results with title, snippet, url
    """
    try:
        # Try Google Custom Search API first
        if GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID:
            logger.info("Trying Google Custom Search API")
            results = await _search_google(query)
            if results:
                return results

        # Try SerpAPI
        if SERPAPI_KEY:
            logger.info("Trying SerpAPI")
            results = await _search_serpapi(query)
            if results:
                return results

        # Fallback
        logger.warning("No search API keys configured")
        return []

    except Exception as e:
        logger.error(f"Error searching for sources: {str(e)}")
        return []


async def _search_google(query: str) -> Optional[list]:
    """Search using Google Custom Search API"""
    try:
        params = {
            "q": query,
            "key": GOOGLE_SEARCH_API_KEY,
            "cx": GOOGLE_SEARCH_ENGINE_ID,
            "num": 5,
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(GOOGLE_SEARCH_URL, params=params, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status == 200:
                    data = await response.json()
                    return _format_google_results(data.get("items", []))
                else:
                    logger.warning(f"Google Search API error: {response.status}")
                    return None

    except Exception as e:
        logger.error(f"Error with Google Search API: {str(e)}")
        return None


async def _search_serpapi(query: str) -> Optional[list]:
    """Search using SerpAPI (Google Search)"""
    try:
        params = {
            "q": query,
            "api_key": SERPAPI_KEY,
            "num": 5,
            "engine": "google"
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(SERPAPI_URL, params=params, timeout=aiohttp.ClientTimeout(total=10)) as response:
                if response.status == 200:
                    data = await response.json()
                    return _format_serpapi_results(data.get("organic_results", []))
                else:
                    logger.warning(f"SerpAPI error: {response.status}")
                    return None

    except Exception as e:
        logger.error(f"Error with SerpAPI: {str(e)}")
        return None


def _format_google_results(items: list) -> list:
    """Format Google Custom Search API results"""
    results = []
    for item in items[:5]:
        results.append({
            "title": item.get("title", ""),
            "snippet": item.get("snippet", ""),
            "url": item.get("link", "")
        })
    return results


def _format_serpapi_results(items: list) -> list:
    """Format SerpAPI results"""
    results = []
    for item in items[:5]:
        results.append({
            "title": item.get("title", ""),
            "snippet": item.get("snippet", ""),
            "url": item.get("link", "")
        })
    return results
