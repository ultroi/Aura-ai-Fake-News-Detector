"""Stage 3: Source credibility evaluation with Groq and optional Gemini fallback."""

import json
import logging
import re
from typing import Optional
from app.services.llm_json_parser import parse_llm_json
from app.services.llm_clients import get_groq_client, get_gemini_client, get_gemini_model_name, handle_groq_exception, reserve_groq_call
import os

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

gemini_client = None
gemini_model_name = None

# Trusted sources - whitelisted domains
TRUSTED_DOMAINS = [
    "bbc.com", "bbc.co.uk",
    "reuters.com",
    "apnews.com",
    "theguardian.com",
    "nytimes.com",
    "aljazeera.com",
    "factcheck.org",
    "snopes.com",
    "politifact.com",
    "fullfact.org",
    "pib.gov.in",  # India Press Information Bureau
    "mea.gov.in",  # India Ministry of External Affairs
    "indiabudget.gov.in",
    "wikipedia.org",
    "britannica.com",
]

# Suspicious/unreliable domains
SUSPICIOUS_DOMAINS = [
    "fake-news.com",
    "clickbait",
    "propoganda",
    "rumor",
    "conspiracy",
    "anonymous",
]


async def evaluate_sources(sources: list, claim: str = "") -> dict:
    """
    Evaluate credibility of search result sources using DETERMINISTIC RULES FIRST.
    
    OPTIMIZATION: Moved to deterministic evaluation by default.
    - Instant scoring using domain reputation rules (no LLM latency)
    - Trusted/suspicious domains scored instantly
    - Groq is fallback ONLY if deterministic scoring fails
    
    Performance: ~0.1s vs ~2-3s with LLM
    
    Args:
        sources: List of sources from search results
    
    Returns:
        Dict with:
        - evaluated_sources: Detailed source evaluations
        - usable_sources_count: Count of should_use=true sources
        - overall_evidence_quality: strong|moderate|weak|insufficient
        - evidence_consensus: supporting|contradicting|mixed|no_consensus
    """
    try:
        if not sources:
            return {
                "trusted_sources": [],
                "moderate_sources": [],
                "suspicious_sources": [],
                "unreliable_sources": [],
                "scored_sources": []
            }
        
        # PRIMARY: Rule-based evaluation (instant, no latency)
        logger.info(f"Stage 3: Evaluating {len(sources)} sources using deterministic rules (fast path)")
        result = _evaluate_sources_rule_based(sources, claim)
        
        # If result is empty/malformed, try LLM as FALLBACK only
        if not result.get("evaluated_sources"):
            logger.warning("Deterministic evaluation returned empty results, attempting Groq fallback")
            groq_client = get_groq_client()
            if groq_client:
                groq_result = await _evaluate_with_groq(sources, claim)
                if groq_result:
                    return groq_result
            
            # If Groq also fails, try Gemini
            gemini_client = get_gemini_client()
            gemini_model_name = get_gemini_model_name()
            if gemini_client and gemini_model_name:
                try:
                    gemini_result = await _evaluate_with_gemini(sources, claim)
                    if gemini_result:
                        return gemini_result
                except Exception as e:
                    logger.warning(f"Gemini fallback failed: {e}")
        
        return result
        
    except Exception as e:
        logger.error(f"Error evaluating sources: {str(e)}")
        return _evaluate_sources_rule_based(sources, claim)


async def _evaluate_with_groq(sources: list, claim: str = "") -> Optional[dict]:
    """Use Groq to evaluate source credibility"""
    groq_client = get_groq_client()
    if not groq_client:
        return None

    try:
        sources_text = _build_sources_text(sources)

        system_prompt = """You are an expert source credibility evaluation engine for a fact-checking system.

Given a list of search results (title + URL + snippet), evaluate each source's trustworthiness and relevance to the claim being verified.

CREDIBILITY SCORING CRITERIA:
- Source type (government/academic = high, blog/unknown = low)
- Domain reputation (established news org vs new site)
- Evidence of bias or agenda
- Relevance to the specific claim
- Recency of information
- Whether it directly addresses the claim or is tangential

SOURCE TIERS:
TIER 1 — HIGH TRUST (score 80-100):
    Government sites (.gov, .nic.in), WHO, UN, peer-reviewed journals,
    established wire services (Reuters, AP, PTI), major national newspapers

TIER 2 — MEDIUM TRUST (score 50-79):
    Established regional news, verified fact-check sites (AltNews, BoomLive,
    FactCheck.org, Snopes), well-known magazines, established TV news sites

TIER 3 — LOW TRUST (score 20-49):
    Blogs, unknown websites, heavily biased outlets, sites with no author info,
    satire sites, newly registered domains

TIER 4 — UNRELIABLE (score 0-19):
    Known misinformation sites, clickbait farms, sites flagged for fake news,
    anonymous posts, social media posts without verification

RELEVANCE SCORING:
- Does the source directly confirm or deny the claim? (high relevance)
- Does it provide background context? (medium relevance)
- Is it only tangentially related? (low relevance)

OUTPUT FORMAT (strict JSON, no markdown, no extra text):
{
    "claim": "<the claim being evaluated>",
    "evaluated_sources": [
        {
            "id": "s1",
            "title": "<source title>",
            "url": "<source url>",
            "domain": "<just the domain name>",
            "credibility_score": <0-100>,
            "credibility_tier": <1|2|3|4>,
            "bias_indicator": "<left|center-left|center|center-right|right|unknown>",
            "relevance_score": <0-100>,
            "stance_on_claim": "<supports|contradicts|neutral|unrelated>",
            "key_evidence": "<one sentence: what specific evidence this source provides>",
            "should_use": <true|false>
        }
    ],
    "usable_sources_count": <number of sources with should_use: true>,
    "overall_evidence_quality": "<strong|moderate|weak|insufficient>",
    "evidence_consensus": "<supporting|contradicting|mixed|no_consensus>"
}"""

        user_prompt = f"""claim:
{claim or 'Not provided'}

search_results:
{sources_text}

Return the JSON object now."""

        if not reserve_groq_call():
            return None

        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            max_tokens=1024,
            temperature=0.2,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )

        response_text = (completion.choices[0].message.content or "").strip()
        if not response_text:
            logger.warning("Groq returned empty response for source credibility")
            return None

        result = parse_llm_json(response_text)
        if not isinstance(result, dict) or not result:
            logger.warning("Groq source credibility response did not contain valid JSON", exc_info=False)
            logger.debug(f"Raw Groq response: {response_text}")
            return None

        return _normalize_credibility_result(result, sources, claim)
        
    except Exception as e:
        if handle_groq_exception(e, "Groq evaluation failed"):
            return None
        logger.error(f"Groq evaluation failed: {str(e)}")
        return None


async def _evaluate_with_gemini(sources: list, claim: str = "") -> Optional[dict]:
    """Use Gemini to evaluate source credibility as a fallback."""
    gemini_client = get_gemini_client()
    gemini_model_name = get_gemini_model_name()
    if not gemini_client or not gemini_model_name:
        return None

    try:
        sources_text = _build_sources_text(sources)

        system_prompt = """You are an expert source credibility evaluation engine for a fact-checking system.

Given a list of search results (title + URL + snippet), evaluate each source's trustworthiness and relevance to the claim being verified.

CREDIBILITY SCORING CRITERIA:
- Source type (government/academic = high, blog/unknown = low)
- Domain reputation (established news org vs new site)
- Evidence of bias or agenda
- Relevance to the specific claim
- Recency of information
- Whether it directly addresses the claim or is tangential

SOURCE TIERS:
TIER 1 — HIGH TRUST (score 80-100):
    Government sites (.gov, .nic.in), WHO, UN, peer-reviewed journals,
    established wire services (Reuters, AP, PTI), major national newspapers

TIER 2 — MEDIUM TRUST (score 50-79):
    Established regional news, verified fact-check sites (AltNews, BoomLive,
    FactCheck.org, Snopes), well-known magazines, established TV news sites

TIER 3 — LOW TRUST (score 20-49):
    Blogs, unknown websites, heavily biased outlets, sites with no author info,
    satire sites, newly registered domains

TIER 4 — UNRELIABLE (score 0-19):
    Known misinformation sites, clickbait farms, sites flagged for fake news,
    anonymous posts, social media posts without verification

RELEVANCE SCORING:
- Does the source directly confirm or deny the claim? (high relevance)
- Does it provide background context? (medium relevance)
- Is it only tangentially related? (low relevance)

OUTPUT FORMAT (strict JSON, no markdown, no extra text):
{
    "claim": "<the claim being evaluated>",
    "evaluated_sources": [
        {
            "id": "s1",
            "title": "<source title>",
            "url": "<source url>",
            "domain": "<just the domain name>",
            "credibility_score": <0-100>,
            "credibility_tier": <1|2|3|4>,
            "bias_indicator": "<left|center-left|center|center-right|right|unknown>",
            "relevance_score": <0-100>,
            "stance_on_claim": "<supports|contradicts|neutral|unrelated>",
            "key_evidence": "<one sentence: what specific evidence this source provides>",
            "should_use": <true|false>
        }
    ],
    "usable_sources_count": <number of sources with should_use: true>,
    "overall_evidence_quality": "<strong|moderate|weak|insufficient>",
    "evidence_consensus": "<supporting|contradicting|mixed|no_consensus>"
}"""

        user_prompt = f"""claim:
{claim or 'Not provided'}

search_results:
{sources_text}

Return the JSON object now."""

        response = gemini_client.models.generate_content(model=gemini_model_name, contents=[system_prompt, user_prompt])
        response_text = (response.text or "") if hasattr(response, "text") else str(response)

        result = parse_llm_json(response_text)
        return _normalize_credibility_result(result, sources, claim)

    except Exception as e:
        logger.error(f"Gemini evaluation failed: {str(e)}")
        return None





def _evaluate_sources_rule_based(sources: list, claim: str = "") -> dict:
    """Rule-based source evaluation"""
    trusted = []
    moderate = []
    suspicious = []
    unreliable = []
    scored = []
    
    for source in sources:
        domain = source.get("source_domain", "").lower()
        score = _calculate_domain_score(domain)
        
        scored.append({
            "source": source,
            "score": score,
            "category": _get_category(score)
        })
        
        if score >= 76:
            trusted.append(source)
        elif score >= 51:
            moderate.append(source)
        elif score >= 26:
            suspicious.append(source)
        else:
            unreliable.append(source)
    
    evaluated_sources = []
    for item in scored:
        src = item["source"]
        score = item["score"]
        tier = 1 if score >= 80 else 2 if score >= 50 else 3 if score >= 20 else 4
        stance = "neutral"
        should_use = score >= 50
        evaluated_sources.append({
            "id": src.get("id", f"s{len(evaluated_sources)+1}"),
            "title": src.get("title", ""),
            "url": src.get("url", ""),
            "domain": src.get("source_domain", ""),
            "credibility_score": score,
            "credibility_tier": tier,
            "bias_indicator": "unknown",
            "relevance_score": score,
            "stance_on_claim": stance,
            "key_evidence": src.get("snippet", "")[:220],
            "should_use": should_use,
        })

    return _finalize_credibility_result(claim, evaluated_sources)


def _calculate_domain_score(domain: str) -> int:
    """
    Calculate credibility score for a domain (0-100) using reputation rules.
    
    OPTIMIZATION: Instant scoring without LLM calls
    - Whitelist scoring: trusted domains get 85+ immediately
    - Blacklist scoring: suspicious domains get 20 immediately
    - Heuristic scoring for unknown domains
    
    Performance: <1ms per domain
    """
    score = 50  # Default neutral score
    domain_lower = domain.lower().strip()
    
    # TIER 1: TRUSTED DOMAINS (85-100)
    # Government & official
    trusted_patterns = [
        # Government agencies
        ".gov", ".gov.in", ".gov.uk", ".gov.au",
        "parliament.gov.in", "pib.gov.in", "mea.gov.in", "indiabudget.gov.in",
        "bbc.com", "bbc.co.uk",
        
        # Major wire services
        "reuters.com", "apnews.com", "associated press",
        "pti.gov.in", "ians.in",
        
        # Major newspapers
        "theguardian.com", "nytimes.com", "washingtonpost.com",
        "bbc.com", "aljazeera.com",
        
        # Academic & research
        ".edu", ".ac.uk", ".ac.in", ".edu.au",
        "wikipedia.org", "britannica.com",
        
        # Health & scientific
        "who.int", "un.org", "scirus.com", "scholar.google",
        "ncbi.nlm.nih.gov", "arxiv.org", "pubmed.gov",
        
        # Fact-checking organizations
        "snopes.com", "factcheck.org", "politifact.com", "fullfact.org",
        "altnews.in", "boomlive.in", "fact-check.org",
    ]
    
    for pattern in trusted_patterns:
        if pattern in domain_lower:
            logger.debug(f"Domain {domain} matched trusted pattern: {pattern}")
            return 85  # High confidence, instant return
    
    # TIER 2: MEDIUM TRUST (50-79)
    medium_patterns = [
        # Established news outlets
        "news", "times", "gazette", "post", "daily", "tribune",
        "telegraph", "mail", "express", "mirror", "independent",
        
        # Magazine/media sites
        "magazine", "medium.com", "substack.com",
        "forbes.com", "businessinsider.com", "techcrunch.com",
        
        # Indian news
        "thehindu.com", "indiatoday.com", "ndtv.com", "dna.com",
        "mid-day.com", "deccan.com", "telegram.news", "aajtak.in",
        "hindustantimes.com", "news18.com",
        
        # BBC/Reuters/AP equivalents
        "bbc", "reuters", "associated", "agence", "ansa.it",
    ]
    
    for pattern in medium_patterns:
        if pattern in domain_lower:
            logger.debug(f"Domain {domain} matched medium pattern: {pattern}")
            score = max(score, 65)
            break
    
    # TIER 3: SUSPICIOUS DOMAINS (20-49)
    suspicious_patterns = [
        "blog", "wordpress", "blogger", "wix.com", "medium.com",
        "reddit.com", "twitter.com", "facebook.com", "instagram.com",
        "tiktok.com", "youtube.com",  # User-generated content
        "pastebin", "anonymous", "4chan", "8kun",
        "unknown", "untitled", "test",
    ]
    
    for pattern in suspicious_patterns:
        if pattern in domain_lower:
            logger.debug(f"Domain {domain} matched suspicious pattern: {pattern}")
            score = min(score, 35)
            break
    
    # TIER 4: BLACKLISTED DOMAINS (0-19)
    blacklist_patterns = [
        "fake-news", "hoax", "conspiracy", "clickbait",
        "satire", "parody", "propaganda", "disinformation",
        "qanon", "infowars", "naturalnews",
    ]
    
    for pattern in blacklist_patterns:
        if pattern in domain_lower:
            logger.debug(f"Domain {domain} matched blacklist pattern: {pattern}")
            return 15  # Very low confidence, instant return
    
    # HEURISTIC ADJUSTMENTS for unknown domains
    if score == 50:  # Still neutral, apply heuristics
        # Domain age proxy: longer domains are often more legitimate
        if len(domain_lower) > 25:
            score += 8
        
        # TLD patterns
        if domain_lower.endswith((".edu", ".ac.uk", ".ac.in", ".edu.au", ".org", ".gov")):
            score += 12
        elif domain_lower.endswith(".net"):
            score += 5
        elif domain_lower.endswith(".info"):
            score -= 5
        
        # Hyphenated domains are sometimes spam
        if domain_lower.count("-") > 2:
            score -= 10
        
        # All-numeric IPs are suspicious
        if domain_lower.replace(".", "").isdigit():
            score = 20
    
    return max(0, min(100, score))  # Clamp to 0-100


def _get_category(score: int) -> str:
    """Get category from score"""
    if score >= 76:
        return "trusted"
    elif score >= 51:
        return "moderate"
    elif score >= 26:
        return "suspicious"
    else:
        return "unreliable"


def _categorize_by_score(sources: list, evaluations: list) -> dict:
    """Categorize sources based on LLM scores"""
    scored = []
    
    for source in sources:
        domain = source.get("source_domain", "")
        
        # Find evaluation for this domain
        eval_score = 50  # Default
        for eval_item in evaluations:
            if domain in eval_item.get("domain", ""):
                eval_score = eval_item.get("score", 50)
                break
        
        scored.append({
            "source": source,
            "score": eval_score,
            "category": _get_category(eval_score)
        })
    
    # Categorize
    trusted = [s for s in scored if s["category"] == "trusted"]
    moderate = [s for s in scored if s["category"] == "moderate"]
    suspicious = [s for s in scored if s["category"] == "suspicious"]
    unreliable = [s for s in scored if s["category"] == "unreliable"]
    
    return {
        "trusted_sources": [s["source"] for s in trusted],
        "moderate_sources": [s["source"] for s in moderate],
        "suspicious_sources": [s["source"] for s in suspicious],
        "unreliable_sources": [s["source"] for s in unreliable],
        "scored_sources": scored
    }


def _build_sources_text(sources: list) -> str:
    lines = []
    for index, source in enumerate(sources[:10], 1):
        lines.append(
            f"{index}. {source.get('title', '')}\n"
            f"   URL: {source.get('url', '')}\n"
            f"   Snippet: {source.get('snippet', '')}"
        )
    return "\n\n".join(lines)


def _normalize_credibility_result(result: dict, sources: list, claim: str) -> dict:
    evaluated_sources = result.get("evaluated_sources") or []
    if not isinstance(evaluated_sources, list):
        evaluated_sources = []

    normalized = []
    for index, item in enumerate(evaluated_sources[: len(sources)], 1):
        if not isinstance(item, dict):
            continue
        normalized.append({
            "id": item.get("id") or f"s{index}",
            "title": item.get("title", sources[index - 1].get("title", "") if index - 1 < len(sources) else ""),
            "url": item.get("url", sources[index - 1].get("url", "") if index - 1 < len(sources) else ""),
            "domain": item.get("domain", sources[index - 1].get("source_domain", "") if index - 1 < len(sources) else ""),
            "credibility_score": item.get("credibility_score", 50),
            "credibility_tier": item.get("credibility_tier", 2),
            "bias_indicator": item.get("bias_indicator", "unknown"),
            "relevance_score": item.get("relevance_score", 50),
            "stance_on_claim": item.get("stance_on_claim", "neutral"),
            "key_evidence": item.get("key_evidence", ""),
            "should_use": bool(item.get("should_use", False)),
        })

    if not normalized:
        normalized = []
        for index, source in enumerate(sources, 1):
            score = _calculate_domain_score(source.get("source_domain", "").lower())
            tier = 1 if score >= 80 else 2 if score >= 50 else 3 if score >= 20 else 4
            normalized.append({
                "id": f"s{index}",
                "title": source.get("title", ""),
                "url": source.get("url", ""),
                "domain": source.get("source_domain", ""),
                "credibility_score": score,
                "credibility_tier": tier,
                "bias_indicator": "unknown",
                "relevance_score": score,
                "stance_on_claim": "neutral",
                "key_evidence": source.get("snippet", "")[:220],
                "should_use": score >= 50,
            })

    return _finalize_credibility_result(claim, normalized)


def _finalize_credibility_result(claim: str, evaluated_sources: list) -> dict:
    usable_sources = [s for s in evaluated_sources if s.get("should_use")]
    supporting = sum(1 for s in usable_sources if s.get("stance_on_claim") == "supports")
    contradicting = sum(1 for s in usable_sources if s.get("stance_on_claim") == "contradicts")
    if supporting and contradicting:
        consensus = "mixed"
    elif supporting:
        consensus = "supporting"
    elif contradicting:
        consensus = "contradicting"
    else:
        consensus = "no_consensus"

    if len(usable_sources) >= 5:
        quality = "strong"
    elif len(usable_sources) >= 3:
        quality = "moderate"
    elif len(usable_sources) >= 1:
        quality = "weak"
    else:
        quality = "insufficient"

    return {
        "claim": claim,
        "evaluated_sources": evaluated_sources,
        "usable_sources_count": len(usable_sources),
        "overall_evidence_quality": quality,
        "evidence_consensus": consensus,
        "trusted_sources": [s for s in usable_sources if s.get("credibility_tier", 4) <= 2],
        "moderate_sources": [s for s in usable_sources if s.get("credibility_tier") == 2],
        "suspicious_sources": [s for s in evaluated_sources if not s.get("should_use")],
        "unreliable_sources": [s for s in evaluated_sources if s.get("credibility_tier", 4) == 4],
        "scored_sources": [
            {
                "source": {
                    "title": s.get("title", ""),
                    "url": s.get("url", ""),
                    "source_domain": s.get("domain", ""),
                    "snippet": s.get("key_evidence", ""),
                },
                "score": s.get("credibility_score", 50),
                "category": _get_category(s.get("credibility_score", 50)),
            }
            for s in evaluated_sources
        ],
    }
