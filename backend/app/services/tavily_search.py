"""Stage 2b: Tavily search API integration"""

import os
import logging
from typing import Optional
from tavily import TavilyClient

logger = logging.getLogger(__name__)

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
tavily_client = TavilyClient(api_key=TAVILY_API_KEY) if TAVILY_API_KEY else None
_tavily_warning_logged = False


async def search_tavily(query: str, max_results: int = 5, include_domains: list = None, exclude_domains: list = None) -> list:
    """
    Search using Tavily API for fact-checking sources.
    
    Args:
        query: Search query
        max_results: Number of results to return
        include_domains: Optional list of domains to include
        exclude_domains: Optional list of domains to exclude
    
    Returns:
        List of search results with:
        - title
        - url
        - snippet/content
        - source_domain
    """
    try:
        if not tavily_client:
            global _tavily_warning_logged
            if not _tavily_warning_logged:
                logger.warning("Tavily API key not configured")
                _tavily_warning_logged = True
            return []
        
        if not query or len(query.strip()) == 0:
            return []
        
        # Search with fact-checking focus
        response = tavily_client.search(
            query=query,
            search_depth="advanced",
            max_results=max_results,
            include_raw_content=True
        )
        
        results = []
        for result in response.get("results", []):
            results.append({
                "title": result.get("title", ""),
                "url": result.get("url", ""),
                "snippet": result.get("content", ""),
                "source_domain": _extract_domain(result.get("url", "")),
                "raw_content": result.get("raw_content", "")
            })
        
        logger.info(f"Tavily search returned {len(results)} results for: {query}")
        return results
        
    except Exception as e:
        logger.error(f"Error searching with Tavily: {str(e)}")
        return []


async def search_multiple_queries(queries: dict) -> dict:
    """
    Search using multiple optimized queries.
    
    Args:
        queries: Dict with query bundle. Supports the new `queries` list schema or the legacy exact/factcheck/official fields.
    
    Returns:
        Dict with results from each query type
    """
    try:
        query_items = _normalize_query_items(queries)

        results = {
            "query_results": [],
            "combined_results": [],
            "claim_id": queries.get("claim_id", "c1"),
            "claim": queries.get("claim", ""),
        }

        collected_results = []
        for query_item in query_items:
            query_text = query_item.get("query", "") if isinstance(query_item, dict) else str(query_item)
            if not query_text:
                continue
            query_results = await search_tavily(query_text)
            results["query_results"].append({
                "query": query_text,
                "strategy": query_item.get("strategy", "direct") if isinstance(query_item, dict) else "direct",
                "results": query_results,
            })
            collected_results.extend(query_results)

        results["combined_results"] = _deduplicate_results(collected_results)
        
        return results
        
    except Exception as e:
        logger.error(f"Error in multi-query search: {str(e)}")
        return {"error": str(e)}


def _extract_domain(url: str) -> str:
    """Extract domain from URL"""
    try:
        from urllib.parse import urlparse
        domain = urlparse(url).netloc
        return domain.replace("www.", "")
    except:
        return ""


def _deduplicate_results(results: list) -> list:
    """Remove duplicate results by URL"""
    seen = set()
    unique = []
    for result in results:
        url = result.get("url", "")
        if url not in seen:
            seen.add(url)
            unique.append(result)
    return unique


def _normalize_query_items(queries: dict) -> list:
    if isinstance(queries.get("queries"), list) and queries.get("queries"):
        return queries.get("queries", [])

    items = []
    exact_query = queries.get("exact_query", "")
    if exact_query:
        items.append({"id": "q1", "query": exact_query, "strategy": "direct"})

    for index, factcheck_query in enumerate(queries.get("factcheck_queries", []), 2):
        if factcheck_query:
            items.append({"id": f"q{index}", "query": factcheck_query, "strategy": "factcheck"})

    official_query = queries.get("official_source_query", "")
    if official_query:
        items.append({"id": f"q{len(items) + 1}", "query": official_query, "strategy": "official"})

    return items
