"""Stage 2: Precision search query generation for fact-checking with Groq and optional Gemini fallback."""

import json
import logging
from typing import Optional
from groq import Groq
from google import genai
from app.services.llm_json_parser import parse_llm_json
import os

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

gemini_client = None
gemini_model_name = None
if GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        gemini_model_name = "gemini-3-flash-preview"
    except Exception as e:
        try:
            gemini_client = genai.Client(api_key=GEMINI_API_KEY)
            gemini_model_name = "gemini-3.1-flash-lite-preview"
        except Exception as e:
            logger.error(f"Failed to configure Gemini: {e}")
            gemini_client = None
            gemini_model_name = None


async def generate_search_queries(claim: str | dict, entities: Optional[list] = None, dates: Optional[list] = None, mode: str = "verify") -> dict:
    """
    Generate optimized search queries for fact-checking or research.
    
    Args:
        claim: The claim or research topic
        entities: Optional list of extracted entities
        dates: Optional list of extracted dates
        mode: "verify" for fact-checking or "research" for informational queries
    
    Returns:
        Dict with queries, strategies, and primary query
    """
    try:
        claim_payload = _normalize_claim_payload(claim)
        claim_text = claim_payload["claim"]
        claim_id = claim_payload["claim_id"]

        if not claim_text or len(claim_text.strip()) == 0:
            return {"error": "Empty claim"}
        
        # Groq is primary; Gemini is a fallback if Groq fails
        if groq_client:
            result = await _generate_with_groq(claim_payload, entities, dates, mode)
            if result:
                return result

        if gemini_client:
            result = await _generate_with_gemini(claim_payload, entities, dates, mode)
            if result:
                return result
            logger.warning("Gemini query generation failed after Groq")
        
        return _fallback_queries(claim_payload)
        
    except Exception as e:
        logger.error(f"Error generating search queries: {str(e)}")
        return _fallback_queries(claim)


async def _generate_with_groq(claim_payload: dict, entities: Optional[list] = None, dates: Optional[list] = None, mode: str = "verify") -> Optional[dict]:
    """Generate queries using Groq"""
    if not groq_client:
        return None

    try:
        claim_text = claim_payload["claim"]
        claim_id = claim_payload["claim_id"]
        entities_str = ", ".join(entities) if entities else "None extracted"
        dates_str = ", ".join(dates) if dates else "None extracted"

        system_prompt = """You are Aura's internal search strategist. Generate targeted search queries to find evidence for the given claim or research topic.

FOR VERIFY MODE — generate queries to find confirmations, denials, and fact-checks.
FOR RESEARCH MODE — generate queries to find comprehensive, authoritative information.

RULES:
- Generate exactly 5 queries
- Make them diverse in angle (direct, official, factcheck, counter, context for verify; overview, expert, analysis, report, context for research)
- Keep queries short and keyword-focused (like actual Google searches)
- For Indian claims: include Indian fact-check sites (AltNews, BoomLive, FactCheck India)
- For research topics: include "explained", "analysis", "report" style queries

OUTPUT (strict JSON only):
{
  "mode": "<verify|research>",
  "claim_id": "<matches claim id>",
  "claim_or_topic": "<the claim or research topic>",
  "queries": [
    {
      "id": "q1",
      "query": "<search query>",
      "strategy": "<direct|official|factcheck|counter|context|overview|expert>",
      "rationale": "<one line why>"
    }
  ],
  "primary_query": "<single best query>"
}"""

        user_prompt = f"""Mode: {mode}
claim_id: {claim_id}
claim_or_topic: {claim_text}
extracted_entities: {entities_str}
extracted_dates: {dates_str}

Generate exactly 5 diverse search queries now."""

        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=512,
            temperature=0.2,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )

        response_text = (completion.choices[0].message.content or "").strip()
        result = parse_llm_json(response_text)
        return _normalize_query_bundle(result, claim_payload)

    except Exception as e:
        logger.error(f"Groq query generation failed: {str(e)}")
        return None


async def _generate_with_gemini(claim_payload: dict, entities: Optional[list] = None, dates: Optional[list] = None, mode: str = "verify") -> Optional[dict]:
    """Generate queries using Gemini"""
    if not gemini_client:
        return None

    try:
        claim_text = claim_payload["claim"]
        claim_id = claim_payload["claim_id"]
        entities_str = ", ".join(entities) if entities else "None extracted"
        dates_str = ", ".join(dates) if dates else "None extracted"

        system_prompt = """You are Aura's internal search strategist. Generate targeted search queries to find evidence for the given claim or research topic.

FOR VERIFY MODE — generate queries to find confirmations, denials, and fact-checks.
FOR RESEARCH MODE — generate queries to find comprehensive, authoritative information.

RULES:
- Generate exactly 5 queries
- Make them diverse in angle (direct, official, factcheck, counter, context for verify; overview, expert, analysis, report, context for research)
- Keep queries short and keyword-focused (like actual Google searches)
- For Indian claims: include Indian fact-check sites (AltNews, BoomLive, FactCheck India)
- For research topics: include "explained", "analysis", "report" style queries

OUTPUT (strict JSON only):
{
  "mode": "<verify|research>",
  "claim_id": "<matches claim id>",
  "claim_or_topic": "<the claim or research topic>",
  "queries": [
    {
      "id": "q1",
      "query": "<search query>",
      "strategy": "<direct|official|factcheck|counter|context|overview|expert>",
      "rationale": "<one line why>"
    }
  ],
  "primary_query": "<single best query>"
}"""

        user_prompt = f"""Mode: {mode}
claim_id: {claim_id}
claim_or_topic: {claim_text}
extracted_entities: {entities_str}
extracted_dates: {dates_str}

Generate exactly 5 diverse search queries now."""

        response = gemini_client.models.generate_content(model=gemini_model_name, contents=[system_prompt, user_prompt])
        response_text = (response.text or "").strip()
        result = parse_llm_json(response_text)
        return _normalize_query_bundle(result, claim_payload)

    except Exception as e:
        logger.error(f"Gemini query generation failed: {str(e)}")
        return None


def _fallback_queries(claim_payload: dict) -> dict:
    """Fallback query generation"""
    claim_text = claim_payload["claim"]
    claim_id = claim_payload["claim_id"]
    return {
        "claim_id": claim_id,
        "claim": claim_text,
        "queries": [
            {"id": "q1", "query": claim_text, "strategy": "direct", "target_source_type": "news", "rationale": "Literal search for the claim"},
            {"id": "q2", "query": f"{claim_text} fact check", "strategy": "factcheck", "target_source_type": "factcheck_site", "rationale": "Find fact-check coverage"},
            {"id": "q3", "query": f"{claim_text} official source", "strategy": "official", "target_source_type": "government", "rationale": "Find authoritative confirmation"},
            {"id": "q4", "query": f"{claim_text} false", "strategy": "counter", "target_source_type": "news", "rationale": "Find contradicting evidence"},
            {"id": "q5", "query": f"{claim_text} context", "strategy": "context", "target_source_type": "academic", "rationale": "Understand background and nuance"},
        ],
        "primary_query": claim_text,
        "exact_query": claim_text,
        "factcheck_queries": [f"{claim_text} fact check", f"{claim_text} verify"],
        "official_source_query": f"official statement {claim_text}"
    }


def _normalize_claim_payload(claim_input: str | dict) -> dict:
    if isinstance(claim_input, dict):
        return {
            "claim_id": str(claim_input.get("id") or claim_input.get("claim_id") or "c1"),
            "claim": str(claim_input.get("claim") or claim_input.get("main_claim") or "").strip(),
        }
    return {"claim_id": "c1", "claim": str(claim_input).strip()}


def _normalize_query_bundle(result: dict, claim_payload: dict) -> dict:
    queries = result.get("queries") or []
    if not isinstance(queries, list):
        queries = []

    normalized_queries = []
    for index, query_item in enumerate(queries[:5], 1):
        if isinstance(query_item, dict):
            normalized_queries.append({
                "id": query_item.get("id") or f"q{index}",
                "query": str(query_item.get("query", "")).strip(),
                "strategy": query_item.get("strategy", "direct"),
                "target_source_type": query_item.get("target_source_type", "news"),
                "rationale": str(query_item.get("rationale", "")).strip(),
            })

    claim_text = claim_payload["claim"]
    claim_id = claim_payload["claim_id"]

    if len(normalized_queries) < 5:
        fallback = _fallback_queries(claim_payload)["queries"]
        for item in fallback:
            if len(normalized_queries) >= 5:
                break
            if item["query"] not in [q["query"] for q in normalized_queries]:
                normalized_queries.append(item)

    primary_query = result.get("primary_query") or (normalized_queries[0]["query"] if normalized_queries else claim_text)

    result["claim_id"] = str(result.get("claim_id") or claim_id)
    result["claim"] = str(result.get("claim") or claim_text)
    result["queries"] = normalized_queries[:5]
    result["primary_query"] = primary_query
    result["exact_query"] = primary_query
    result["factcheck_queries"] = [q["query"] for q in normalized_queries if q["strategy"] in {"factcheck", "counter", "context"}][:2]
    result["official_source_query"] = next((q["query"] for q in normalized_queries if q["strategy"] == "official"), primary_query)
    return result
