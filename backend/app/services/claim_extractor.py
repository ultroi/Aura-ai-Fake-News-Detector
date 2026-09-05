"""Stage 1: Production-grade claim extraction engine with Groq and optional Gemini fallback."""

import os
import json
import logging
import re
from typing import Optional
from langdetect import detect, DetectorFactory
from app.services.llm_json_parser import parse_llm_json
from app.services.llm_clients import get_groq_client, get_gemini_client, get_gemini_model_name, handle_groq_exception, reserve_groq_call

# Set seed for consistent language detection
DetectorFactory.seed = 0

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

gemini_client = None
gemini_model_name = None


async def extract_claim(user_input: str) -> dict:
    """
    Extract factual claims from user input in multiple languages.
    
    Args:
        user_input: User message (can be EN/HI/Hinglish)
    
    Returns:
        Dict with:
        - original_input: User's original input
        - detected_language: Detected language (en/hi/hinglish)
        - extracted_claims: List of factual claims
        - main_claim: Primary claim to verify
        - entities: Named entities (person, organization, location)
        - dates: Extracted dates/timelines
        - locations: Geographic locations mentioned
        - is_opinion: Boolean if claim is opinion vs factual
        - translated_claim: English version for searching
    """
    try:
        groq_client = get_groq_client()

        if not user_input or len(user_input.strip()) == 0:
            return {
                "error": "Empty input",
                "original_input": user_input
            }
        
        # Detect language
        detected_lang = _detect_language(user_input)
        logger.info(f"Detected language: {detected_lang}")
        
        # Groq is primary; Gemini is a fallback if Groq fails
        if groq_client:
            extraction_result = await _extract_with_groq(user_input, detected_lang)
            if extraction_result:
                return extraction_result

        gemini_client = get_gemini_client()
        gemini_model_name = get_gemini_model_name()
        if gemini_client and gemini_model_name:
            extraction_result = await _extract_with_gemini(user_input, detected_lang)
            if extraction_result:
                return extraction_result
            logger.warning("Gemini extraction failed after Groq")

        logger.warning("All LLM extraction paths failed; using regex fallback")
        
        # Fallback to simple extraction if LLM fails
        return _fallback_extraction(user_input, detected_lang)
        
    except Exception as e:
        logger.error(f"Error extracting claim: {str(e)}")
        return {
            "error": str(e),
            "original_input": user_input,
            "main_claim": user_input,
            "translated_claim": user_input
        }


def _detect_language(text: str) -> str:
    """Detect language: en, hi, or hinglish"""
    try:
        lang = detect(text)
        
        # Check for Hinglish (mix of Hindi and English)
        if lang == "hi":
            english_words = len([w for w in text.split() if ord(w[0]) < 128])
            hindi_words = len([w for w in text.split() if ord(w[0]) >= 2304])
            
            if english_words > 0 and hindi_words > 0:
                return "hinglish"
            return "hi"
        
        return "en" if lang == "en" else lang
        
    except Exception as e:
        logger.warning(f"Language detection failed: {e}, assuming English")
        return "en"


async def _extract_with_groq(text: str, lang: str) -> Optional[dict]:
    """Use Groq to extract claims intelligently"""
    groq_client = get_groq_client()
    if not groq_client:
        return None
    
    try:
        system_prompt = """You are Aura's internal claim parser. Your output feeds directly into a fact-checking pipeline — it is never shown to the user.

Extract all verifiable factual claims from the user's message.

RULES:
- Extract 1-5 claims max (prioritize the most specific and verifiable ones)
- Each claim must be standalone and self-contained (no pronouns, full names)
- Strip emotional language — keep only the factual core
- If the input is a question ("is it true that X?") — convert X into a claim
- If user is asking for research (not verification) — set mode to "research"
- If no verifiable claim exists — set claims to empty array

DETECT MODE:
- "research" → user is asking about a topic, wants explanation/context
- "verify"   → user is sharing a claim/news and wants true/false verdict
- "mixed"    → user wants both (e.g., "is X true, and also tell me more about it")

OUTPUT (strict JSON only):
{
  "mode": "<verify|research|mixed>",
  "original_input": "<exact user input>",
  "claims": [
    {
      "id": "c1",
      "claim": "<clean normalized claim>",
      "type": "<statistical|event|identity|scientific|policy|comparative>",
      "subject": "<main entity>",
      "verifiability": <0.0-1.0>
    }
  ],
  "research_topic": "<if mode is research/mixed: what topic to research — else null>",
  "claim_count": <number>
}"""

        user_prompt = f"""Input language: {lang}
User input:
{text}

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
        
        result = parse_llm_json(response_text)
        return _normalize_claim_extraction_result(result, text, lang)
        
    except Exception as e:
        if handle_groq_exception(e, "Groq extraction failed"):
            return None
        logger.error(f"Groq extraction failed: {str(e)}")
        return None


async def _extract_with_gemini(text: str, lang: str) -> Optional[dict]:
    """Use Google Gemini to extract claims intelligently"""
    gemini_client = get_gemini_client()
    gemini_model_name = get_gemini_model_name()
    if not gemini_client:
        return None
    
    try:
        system_prompt = """You are Aura's internal claim parser. Your output feeds directly into a fact-checking pipeline — it is never shown to the user.

Extract all verifiable factual claims from the user's message.

RULES:
- Extract 1-5 claims max (prioritize the most specific and verifiable ones)
- Each claim must be standalone and self-contained (no pronouns, full names)
- Strip emotional language — keep only the factual core
- If the input is a question ("is it true that X?") — convert X into a claim
- If user is asking for research (not verification) — set mode to "research"
- If no verifiable claim exists — set claims to empty array

DETECT MODE:
- "research" → user is asking about a topic, wants explanation/context
- "verify"   → user is sharing a claim/news and wants true/false verdict
- "mixed"    → user wants both (e.g., "is X true, and also tell me more about it")

OUTPUT (strict JSON only):
{
  "mode": "<verify|research|mixed>",
  "original_input": "<exact user input>",
  "claims": [
    {
      "id": "c1",
      "claim": "<clean normalized claim>",
      "type": "<statistical|event|identity|scientific|policy|comparative>",
      "subject": "<main entity>",
      "verifiability": <0.0-1.0>
    }
  ],
  "research_topic": "<if mode is research/mixed: what topic to research — else null>",
  "claim_count": <number>
}"""

        user_prompt = f"""Input language: {lang}
User input:
{text}

Return the JSON object now."""
        
        response = gemini_client.models.generate_content(model=gemini_model_name, contents=[system_prompt, user_prompt])
        response_text = (response.text or "").strip()
        
        result = parse_llm_json(response_text)
        return _normalize_claim_extraction_result(result, text, lang)
        
    except Exception as e:
        logger.error(f"Gemini extraction failed: {str(e)}")
        return None


def _fallback_extraction(text: str, lang: str) -> dict:
    """Fallback extraction using regex patterns"""
    
    # Simple entity extraction using regex
    entities = _extract_entities_regex(text)
    dates = _extract_dates(text)
    locations = _extract_locations(text)
    
    return {
        "original_input": text,
        "detected_language": lang,
        "claims": [{"id": "c1", "claim": text, "type": "event", "subject": _guess_subject(text), "confidence": 0.1}],
        "extracted_claims": [text],
        "main_claim": text,
        "entities": entities,
        "dates": dates,
        "locations": locations,
        "is_opinion": False,
        "translated_claim": text if lang == "en" else text,  # Would need translation service
    }


def _normalize_claim_extraction_result(result: dict, text: str, lang: str) -> dict:
    claims = result.get("claims") or []
    if not isinstance(claims, list):
        claims = []

    normalized_claims = []
    for index, claim_item in enumerate(claims[:5], 1):
        if isinstance(claim_item, dict):
            normalized_claims.append({
                "id": claim_item.get("id") or f"c{index}",
                "claim": str(claim_item.get("claim", "")).strip(),
                "type": claim_item.get("type", "event"),
                "subject": str(claim_item.get("subject", "unknown")).strip() or "unknown",
                "confidence": claim_item.get("confidence", 0.5),
            })
        elif isinstance(claim_item, str):
            normalized_claims.append({
                "id": f"c{index}",
                "claim": claim_item.strip(),
                "type": "event",
                "subject": "unknown",
                "confidence": 0.5,
            })

    if not normalized_claims:
        fallback_claim = text.strip()
        normalized_claims = [{
            "id": "c1",
            "claim": fallback_claim,
            "type": "event",
            "subject": _guess_subject(fallback_claim),
            "verifiability": 0.1,
        }]

    extracted_claims = [claim["claim"] for claim in normalized_claims if claim.get("claim")]
    main_claim = extracted_claims[0] if extracted_claims else text.strip()

    # Preserve mode and research_topic from LLM result
    result["original_input"] = text
    result["detected_language"] = lang
    result["claims"] = normalized_claims
    result["claim_count"] = len(normalized_claims)
    result["extracted_claims"] = extracted_claims
    result["main_claim"] = main_claim
    result["mode"] = result.get("mode", "verify")  # Default to verify if not detected
    result["research_topic"] = result.get("research_topic")  # Can be None
    result["entities"] = list(dict.fromkeys([claim.get("subject", "") for claim in normalized_claims if claim.get("subject") and claim.get("subject") != "unknown"]))
    result["dates"] = result.get("dates") or _extract_dates(text)
    result["locations"] = result.get("locations") or _extract_locations(text)
    result["translated_claim"] = result.get("translated_claim") or main_claim
    return result


def _guess_subject(text: str) -> str:
    entities = _extract_entities_regex(text)
    return entities[0] if entities else "unknown"


def _extract_entities_regex(text: str) -> list:
    """Extract simple entities using regex"""
    entities = []
    
    # Capitalized words (potential entities)
    words = text.split()
    for word in words:
        if word and word[0].isupper() and len(word) > 2:
            entities.append(word)
    
    return list(set(entities))[:10]  # Return unique, limit to 10


def _extract_dates(text: str) -> list:
    """Extract dates and time references"""
    dates = []
    
    # Common date patterns
    date_patterns = [
        r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}',  # DD/MM/YYYY
        r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}',  # Month Day, Year
        r'\d{4}',  # Year only
        r'(?:today|tomorrow|yesterday|next\s+\w+|last\s+\w+)',  # Relative dates
    ]
    
    for pattern in date_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        dates.extend(matches)
    
    return list(set(dates))


def _extract_locations(text: str) -> list:
    """Extract location references"""
    locations = []
    
    # Common location keywords
    location_keywords = [
        'India', 'USA', 'UK', 'China', 'Russia', 'Delhi', 'Mumbai', 'Bangalore',
        'New York', 'London', 'Paris', 'Tokyo', 'Australia', 'Canada', 'Germany',
        'भारत', 'दिल्ली', 'मुंबई', 'बेंगलुरु'
    ]
    
    for loc in location_keywords:
        if loc.lower() in text.lower():
            locations.append(loc)
    
    return list(set(locations))
