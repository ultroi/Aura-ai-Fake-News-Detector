"""Stage 4: Final verdict engine with Groq and optional Gemini fallback."""

import os
import json
import logging
from typing import Optional
from datetime import datetime
from groq import Groq
from google import genai
from app.services.llm_json_parser import parse_llm_json
from app.services.tavily_search import search_multiple_queries

logger = logging.getLogger(__name__)

# API Keys
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

gemini_client = None
gemini_model_name = None
_groq_warning_logged = False
if GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        gemini_model_name = "gemini-3-flash-preview"
    except Exception as e:
        try:
            gemini_client = genai.Client(api_key=GEMINI_API_KEY)
            gemini_model_name = "gemini-3.1-flash-lite-preview"
        except Exception as e:
            logger.warning(f"Gemini configuration failed: {e}")
            gemini_client = None
            gemini_model_name = None

VERDICT_DISPLAY_CATEGORIES = {
    "true": "TRUE",
    "likely_true": "LIKELY TRUE",
    "misleading": "MISLEADING",
    "likely_fake": "LIKELY FAKE",
    "fake": "FAKE",
    "unverified": "UNVERIFIED",
}

VERDICT_NORMALIZATION = {
    "TRUE": "true",
    "LIKELY TRUE": "likely_true",
    "MISLEADING": "misleading",
    "LIKELY FAKE": "likely_fake",
    "FAKE": "fake",
    "UNVERIFIED": "unverified",
}


async def analyze_claim(
    original_claim: str,
    extracted_claims: list,
    search_results: list,
    source_credibility: dict,
    translated_claim: Optional[str] = None
) -> dict:
    """
    Stage 4: Final LLM analysis with 6-tier verdict system.

    Args:
        original_claim: User's original claim
        extracted_claims: Claims extracted by Stage 1
        search_results: Combined search results from Tavily
        source_credibility: Source evaluation from Stage 3
        translated_claim: English translation if needed

    Returns:
        Dict with:
        - verdict: verified_true | likely_true | misleading | likely_fake | fake | unverified
        - confidence: 0-100
        - reason: Explanation of the verdict
        - trusted_sources: URLs of trusted sources used
        - suspicious_sources: URLs of questionable sources
        - summary: Brief summary for user
    """
    try:
        # If the claim appears time-sensitive (mentions the current year or "this year"),
        # attempt a Tavily search first and inject those results into the final reasoning
        # so Groq receives fresh, real-time context.
        try:
            current_year = datetime.utcnow().year
            lc_claim = (original_claim or "").lower()
            if (str(current_year) in (original_claim or "") or "this year" in lc_claim or "current year" in lc_claim) and search_multiple_queries:
                try:
                    queries = {
                        "claim_id": "auto",
                        "claim": original_claim,
                        "queries": [
                            {"id": "time_sensitive", "query": f"{original_claim} {current_year}", "strategy": "direct"},
                            {"id": "factcheck", "query": f"{original_claim} {current_year} news facts", "strategy": "factcheck"}
                        ]
                    }
                    tavily_results = await search_multiple_queries(queries)
                    if isinstance(tavily_results, dict):
                        combined = tavily_results.get("combined_results", [])
                        if combined:
                            search_results = combined
                            logger.info("Injected Tavily results for time-sensitive claim before final reasoning")
                except Exception as e:
                    logger.warning(f"Tavily time-sensitive search failed: {e}")
        except Exception:
            pass

        if not groq_client:
            global _groq_warning_logged
            if not _groq_warning_logged:
                logger.error("Groq API key not configured - cannot perform final reasoning")
                _groq_warning_logged = True
            return _default_response(original_claim, [])
        
        search_context = _prepare_search_context(search_results)
        trusted_sources = source_credibility.get("trusted_sources", [])
        suspicious_sources = source_credibility.get("suspicious_sources", [])
        
        logger.info("Analyzing claim with Groq LLM - Stage 4 (primary)")
        result = await _analyze_with_groq_stage4(
            original_claim,
            extracted_claims,
            search_results,
            source_credibility,
            translated_claim
        )
        if result:
            return result

        # Groq failed; try Gemini as a fallback if configured
        if gemini_client:
            logger.info("Groq failed; attempting Gemini fallback for final reasoning")
            try:
                gemini_result = await _analyze_with_gemini_stage4(
                    original_claim,
                    extracted_claims,
                    search_results,
                    source_credibility,
                    translated_claim
                )
                if gemini_result:
                    logger.info("Gemini fallback succeeded")
                    return gemini_result
                else:
                    logger.warning("Gemini fallback returned no result")
            except Exception as e:
                logger.error(f"Error during Gemini fallback: {e}")

        logger.error("Final reasoning unavailable - returning Unverified")
        return _default_response(original_claim, search_results)
        
    except Exception as e:
        logger.error(f"Error in analyze_claim: {str(e)}")
        return _default_response(original_claim, search_results)



async def _analyze_with_groq_stage4(
        original_claim: str,
        extracted_claims: list,
        search_results: list,
        source_credibility: dict,
        translated_claim: Optional[str] = None
    ) -> Optional[dict]:
    """Analyze using Groq with Stage 4 logic"""
    if not groq_client:
        return None

    try:
        logger.debug(f"Stage 4 - Search results count: {len(search_results)}")
        logger.debug(f"Stage 4 - Source credibility keys: {source_credibility.keys() if source_credibility else 'None'}")
        
        system_prompt = """You are a senior fact-checking analyst and misinformation verification expert with deep expertise in media literacy, source analysis, and logical reasoning.

You will receive:
- A factual claim made by a user
- A curated list of credible sources with their stances and key evidence
- An evidence quality assessment

Your task is to deliver a final, well-reasoned verdict on the claim.

VERDICT DEFINITIONS (use EXACTLY these labels):
- "TRUE"         → Multiple high-tier sources explicitly confirm the claim with strong evidence
- "LIKELY TRUE"  → Most evidence supports the claim; minor gaps or indirect confirmation
- "MISLEADING"   → Core fact may be true but lacks critical context, is out of date,
                     or is framed deceptively to lead to a false conclusion
- "LIKELY FAKE"  → Most credible evidence contradicts the claim; lacks supporting sources
- "FAKE"         → Multiple high-tier sources explicitly debunk the claim
- "UNVERIFIED"   → Insufficient reliable sources; claim cannot be confirmed or denied

STRICT RULES:
- DO NOT guess. If evidence is insufficient, verdict must be "UNVERIFIED"
- DO NOT rely on your training knowledge alone — base verdict on provided sources
- DO NOT let source quantity override source quality (1 Reuters > 10 blogs)
- Flag if claim is time-sensitive (true in past, may have changed)
- Flag if claim is partially true (distinguish from misleading)
- Confidence score must honestly reflect evidence strength, not just your certainty

CRITICAL RULES ABOUT KNOWLEDGE & TIME:
- You NEVER tell the user you have a knowledge cutoff date
- You NEVER say "as of my last update" or "I don't have real-time data"
- If a question involves recent/current events — you search first, THEN answer
- If search returns no results — say "I couldn't find reliable data on this right now" — NOT "my knowledge cutoff is..."
- You are not a static database — you are a live research assistant
- For current year questions, ALWAYS attempt a search before responding

RESPONSE LENGTH RULES:
- If you found data → give the data, cite it, done
- If you couldn't find data → say it in 2-3 lines max and suggest what to search
- NEVER pad a "no result" response with generic information
- NEVER open with phrases like "I'm happy to help", "Certainly", "Great question"
- A short honest answer beats a long useless one every time

REASONING REQUIREMENTS:
- paragraph_1: What the claim is asserting and what we searched for
- paragraph_2: What the supporting evidence says (cite sources by domain)
- paragraph_3: What the contradicting or complicating evidence says
- paragraph_4: Why you reached this verdict — the logical conclusion

OUTPUT FORMAT (strict JSON, no markdown, no extra text):
{
    "claim": "<exact claim that was verified>",
    "verdict": "<TRUE|LIKELY TRUE|MISLEADING|LIKELY FAKE|FAKE|UNVERIFIED>",
    "confidence": <0-100 integer>,
    "short_summary": "<1 sentence verdict summary for UI display, max 20 words>",
    "reasoning": {
    "paragraph_1": "<What the claim asserts and scope of verification>",
    "paragraph_2": "<Supporting evidence with source citations>",
    "paragraph_3": "<Contradicting or complicating evidence>",
    "paragraph_4": "<Logical conclusion and why this verdict was reached>"
    },
    "key_facts": [
    "<specific verifiable fact 1 found during research>",
    "<specific verifiable fact 2>",
    "<specific verifiable fact 3>"
    ],
    "important_context": "<critical context that changes how this claim should be read — null if none>",
    "time_sensitive": <true|false>,
    "time_note": "<if time_sensitive is true: explain what may have changed — else null>",
    "top_sources": [
    {
        "domain": "<domain.com>",
        "stance": "<supports|contradicts|neutral>",
        "credibility_tier": <1|2|3|4>
    }
    ],
    "follow_up_claims": [
    "<related claim worth checking>",
    "<another related claim>"
    ]
}"""

        user_prompt = _build_final_verdict_user_prompt(
            original_claim=original_claim,
            extracted_claims=extracted_claims,
            search_results=search_results,
            source_credibility=source_credibility,
            translated_claim=translated_claim,
        )
        
        logger.debug(f"User prompt length: {len(user_prompt)}")
        if len(user_prompt) < 50:
            logger.warning(f"User prompt seems too short: {user_prompt[:200]}")

        try:
            completion = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=2048,
            )
        except Exception as api_error:
            logger.error(f"Groq API error: {api_error}")
            return None

        if not completion.choices or len(completion.choices) == 0:
            logger.error("Groq returned no choices")
            return None
        
        response_text = (completion.choices[0].message.content or "").strip()
        logger.debug(f"Groq response length: {len(response_text)}")
        if len(response_text) == 0:
            logger.error("Groq returned empty response - model may not have generated content")
            return None
        
        trusted_sources = source_credibility.get("trusted_sources", [])
        suspicious_sources = source_credibility.get("suspicious_sources", [])
        return _parse_stage4_response(response_text, trusted_sources, suspicious_sources)

    except Exception as e:
        logger.error(f"Error with Groq Stage 4 analysis: {str(e)}")
        return None


# Note: Gemini runtime removed. Groq is the only allowed model for final reasoning.


def _build_stage4_prompt(
    original_claim: str,
    extracted_claims: list,
    search_context: str,
    translated_claim: Optional[str] = None
) -> str:
    """Build the prompt for Stage 4 analysis"""
    
    claims_text = "\n".join([f"- {claim}" for claim in extracted_claims])
    if not claims_text:
        claims_text = f"- {original_claim}"
    
    translation_note = ""
    if translated_claim and translated_claim != original_claim:
        translation_note = f"\n\nTranslated to English: {translated_claim}"
    
    return f"""You are an advanced fact-checking AI. Analyze the following claim(s) thoroughly.

ORIGINAL CLAIM:
{original_claim}

EXTRACTED CLAIMS:
{claims_text}
{translation_note}

SEARCH CONTEXT FROM FACT-CHECKING SOURCES:
{search_context}

---VERDICT OPTIONS---
- "verified_true": Multiple trusted sources directly confirm this claim
- "likely_true": Strong evidence supports this, but not definitively confirmed
- "misleading": Partially true but missing important context or manipulated
- "likely_fake": Most evidence contradicts or debunks this
- "fake": Multiple trusted sources explicitly debunk this claim
- "unverified": Insufficient reliable information available

---ANALYSIS INSTRUCTIONS---
1. Examine each source carefully
2. Look for direct confirmation or contradiction
3. Consider context and nuance
4. Be specific about what evidence you found
5. Explain why you chose this verdict
6. Note any missing information or alternative perspectives

---OUTPUT---
Respond with ONLY valid JSON. The "reason" field MUST be detailed (3-4 paragraphs minimum):

{{
    "verdict": "verified_true|likely_true|misleading|likely_fake|fake|unverified",
    "confidence": 0-100,
    "reason": "Provide a comprehensive 3-4 paragraph analysis explaining: (1) What the claim states, (2) What evidence you found (citing specific sources), (3) How the evidence supports or contradicts the claim, (4) Your final reasoning for this verdict. Be thorough and educational.",
    "summary": "One-line verdict summary"
}}"""


def _build_final_verdict_user_prompt(
    original_claim: str,
    extracted_claims: list,
    search_results: list,
    source_credibility: dict,
    translated_claim: Optional[str] = None,
) -> str:
    # Filter to usable sources and ensure we have data
    usable_sources = [source for source in search_results if source.get("should_use", True)]
    
    if not usable_sources:
        logger.warning("No usable sources provided to final verdict prompt")
        usable_sources = search_results[:5] if search_results else []
    
    claims_text = "\n".join([f"- {claim}" for claim in extracted_claims]) if extracted_claims else f"- {original_claim}"
    sources_text = []
    
    for index, source in enumerate(usable_sources[:10], 1):
        title = source.get('title', 'Untitled source')
        domain = source.get('domain') or source.get('source_domain', 'unknown')
        url = source.get('url', 'no url')
        stance = source.get('stance_on_claim', 'neutral')
        tier = source.get('credibility_tier', 'unknown')
        score = source.get('credibility_score', source.get('score', 50))
        evidence = source.get('key_evidence', source.get('snippet', 'no evidence'))
        
        sources_text.append(
            f"{index}. {title}\n"
            f"   domain: {domain}\n"
            f"   url: {url}\n"
            f"   stance_on_claim: {stance}\n"
            f"   credibility_tier: {tier}\n"
            f"   credibility_score: {score}\n"
            f"   key_evidence: {evidence}"
        )

    sources_section = chr(10).join(sources_text) if sources_text else "No usable sources available."

    return f"""CLAIM:
{original_claim}

TRANSLATED CLAIM:
{translated_claim or original_claim}

EXTRACTED CLAIMS:
{claims_text}

EVIDENCE QUALITY:
- overall_evidence_quality: {source_credibility.get('overall_evidence_quality', 'insufficient')}
- evidence_consensus: {source_credibility.get('evidence_consensus', 'no_consensus')}
- usable_sources_count: {source_credibility.get('usable_sources_count', len(usable_sources))}

CURATED SOURCES (should_use=true only):
{sources_section}

Return the JSON object exactly as specified in the system prompt."""


async def _analyze_with_gemini_stage4(
    original_claim: str,
    extracted_claims: list,
    search_results: list,
    source_credibility: dict,
    translated_claim: Optional[str] = None
) -> Optional[dict]:
    """Analyze using Google Gemini as a fallback for Stage 4 logic."""
    if not gemini_client or not gemini_model_name:
        return None

    try:
        prompt = _build_final_verdict_user_prompt(
            original_claim=original_claim,
            extracted_claims=extracted_claims,
            search_results=search_results,
            source_credibility=source_credibility,
            translated_claim=translated_claim,
        )

        # Use the generative model to create content; wrap in try/except for safe fallback
        response = gemini_client.models.generate_content(model=gemini_model_name, contents=prompt)
        response_text = (response.text or str(response)).strip()
        trusted_sources = source_credibility.get("trusted_sources", [])
        suspicious_sources = source_credibility.get("suspicious_sources", [])
        return _parse_stage4_response(response_text, trusted_sources, suspicious_sources)

    except Exception as e:
        logger.error(f"Error with Gemini Stage 4 analysis: {str(e)}")
        return None


def _parse_stage4_response(response_text: str, trusted_sources: list, suspicious_sources: list) -> dict:
    """
    Parse Stage 4 LLM response with 6-tier verdict system.

    Args:
        response_text: Raw response from LLM
        trusted_sources: List of trusted source objects
        suspicious_sources: List of suspicious source objects

    Returns:
        Structured analysis result with new verdict categories
    """
    try:
        result = parse_llm_json(response_text)

        # Validate and normalize verdict
        verdict_raw = str(result.get("verdict", "UNVERIFIED")).strip().upper()
        verdict = VERDICT_NORMALIZATION.get(verdict_raw, "unverified")

        confidence_raw = result.get("confidence", None)
        try:
            confidence = int(confidence_raw) if confidence_raw is not None else 50
        except Exception:
            try:
                confidence = int(float(confidence_raw))
            except Exception:
                confidence = 50

        confidence = max(0, min(100, confidence))

        short_summary = str(result.get("short_summary") or result.get("summary") or "Analysis inconclusive.")
        reasoning = result.get("reasoning") or {}
        if isinstance(reasoning, dict):
            reason = "\n\n".join(
                [
                    reasoning.get("paragraph_1", "").strip(),
                    reasoning.get("paragraph_2", "").strip(),
                    reasoning.get("paragraph_3", "").strip(),
                    reasoning.get("paragraph_4", "").strip(),
                ]
            ).strip()
        else:
            reason = str(result.get("reason", "Analysis inconclusive."))

        summary = short_summary

        trusted_urls = [s.get("url", "") for s in trusted_sources if s.get("url")]
        suspicious_urls = [s.get("url", "") for s in suspicious_sources if s.get("url")]
        top_sources = result.get("top_sources", []) if isinstance(result.get("top_sources", []), list) else []

        return {
            "verdict": verdict,
            "verdict_display": VERDICT_DISPLAY_CATEGORIES.get(verdict, "UNVERIFIED"),
            "confidence": confidence,
            "reason": reason,
            "summary": summary,
            "trusted_sources": trusted_urls[:5],
            "suspicious_sources": suspicious_urls[:5],
            "short_summary": short_summary,
            "key_facts": result.get("key_facts", []),
            "important_context": result.get("important_context"),
            "time_sensitive": bool(result.get("time_sensitive", False)),
            "time_note": result.get("time_note"),
            "top_sources": top_sources,
            "follow_up_claims": result.get("follow_up_claims", []),
            "sources_count": {
                "trusted": len(trusted_sources),
                "suspicious": len(suspicious_sources)
            }
        }

    except json.JSONDecodeError:
        logger.error(f"Failed to parse LLM JSON after cleaning: {response_text}")
        return _default_response("", [])
    except Exception as e:
        logger.error(f"Error parsing LLM response: {str(e)}")
        return _default_response("", [])


def _prepare_search_context(search_results: list) -> str:
    """
    Prepare search results as context for the LLM.

    Args:
        search_results: List of search result objects

    Returns:
        Formatted string with search context
    """
    if not search_results:
        return "No search results available."

    context = "Curated Sources:\n"
    for i, result in enumerate(search_results[:10], 1):
        context += f"\n{i}. {result.get('title', 'No title')}\n"
        context += f"   Domain: {result.get('domain', result.get('source_domain', ''))}\n"
        context += f"   URL: {result.get('url', '')}\n"
        context += f"   Stance: {result.get('stance_on_claim', 'neutral')}\n"
        context += f"   Tier: {result.get('credibility_tier', 'unknown')}\n"
        context += f"   Score: {result.get('credibility_score', result.get('score', 50))}\n"
        evidence = result.get('key_evidence') or result.get('snippet', '')
        if evidence:
            context += f"   Evidence: {evidence}\n"

    return context


def _default_response(_claim: str, _sources: list) -> dict:
    """Return a default response when analysis fails"""
    return {
        "verdict": "unverified",
        "verdict_display": "Unverified",
        "confidence": 0,
        "reason": "Unable to analyze this claim at this time. Please try again later or check your API configuration.",
        "summary": "Analysis unavailable",
        "trusted_sources": [],
        "suspicious_sources": [],
        "sources_count": {"trusted": 0, "suspicious": 0}
    }
