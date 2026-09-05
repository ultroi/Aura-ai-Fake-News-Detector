"""Stage 4: Conversational response generator - generates human-like replies to users."""

import os
import json
import logging
from typing import Optional
from app.services.llm_json_parser import parse_llm_json
from app.services.llm_clients import get_groq_client, get_gemini_client, get_gemini_model_name, handle_groq_exception, reserve_groq_call

logger = logging.getLogger(__name__)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

gemini_client = None
gemini_model_name = None


async def generate_response(
    user_input: str,
    mode: str,
    extracted_claims: list,
    research_topic: Optional[str],
    search_results: list,
    source_credibility: dict,
    detected_language: str = "en",
    verdict: Optional[str] = None,
    confidence: Optional[int] = None,
    analysis_reason: Optional[str] = None,
) -> str:
    try:
        groq_client = get_groq_client()
        if not groq_client:
            logger.error("Groq not configured")
            return _fallback_response(mode)
        
        logger.info(f"Generating response - Mode: {mode}, Language: {detected_language}")
        
        response_text = await _generate_with_groq(
            user_input=user_input,
            mode=mode,
            extracted_claims=extracted_claims,
            research_topic=research_topic,
            search_results=search_results,
            source_credibility=source_credibility,
            detected_language=detected_language,
            verdict=verdict,
            confidence=confidence,
            analysis_reason=analysis_reason,
        )
        
        if response_text:
            return response_text
        
        # Groq failed, try Gemini
        gemini_client = get_gemini_client()
        gemini_model_name = get_gemini_model_name()
        if gemini_client and gemini_model_name:
            logger.info("Groq failed, trying Gemini fallback")
            response_text = await _generate_with_gemini(
                user_input=user_input,
                mode=mode,
                extracted_claims=extracted_claims,
                research_topic=research_topic,
                search_results=search_results,
                source_credibility=source_credibility,
                detected_language=detected_language,
                verdict=verdict,
                confidence=confidence,
                analysis_reason=analysis_reason,
            )
            if response_text:
                return response_text
        
        logger.error("Both LLMs failed for response generation")
        return _fallback_response(mode)
        
    except Exception as e:
        logger.error(f"Error generating response: {e}")
        return _fallback_response(mode)


async def _generate_with_groq(
    user_input: str,
    mode: str,
    extracted_claims: list,
    research_topic: Optional[str],
    search_results: list,
    source_credibility: dict,
    detected_language: str,
    verdict: Optional[str] = None,
    confidence: Optional[int] = None,
    analysis_reason: Optional[str] = None,
) -> Optional[str]:
    """Generate response using Groq"""
    try:
        groq_client = get_groq_client()
        if not groq_client:
            return None

        system_prompt = _build_system_prompt(detected_language)
        user_prompt = _build_user_prompt(
            user_input=user_input,
            mode=mode,
            extracted_claims=extracted_claims,
            research_topic=research_topic,
            search_results=search_results,
            source_credibility=source_credibility,
            verdict=verdict,
            confidence=confidence,
            analysis_reason=analysis_reason,
        )
        
        if not reserve_groq_call():
            return None

        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=900,
        )
        
        response_text = (completion.choices[0].message.content or "").strip()
        if len(response_text) > 0:
            return response_text
        
        logger.warning("Groq returned empty response")
        return None
        
    except Exception as e:
        if handle_groq_exception(e, "Groq generation failed"):
            return None
        logger.error(f"Groq generation failed: {e}")
        return None


async def _generate_with_gemini(
    user_input: str,
    mode: str,
    extracted_claims: list,
    research_topic: Optional[str],
    search_results: list,
    source_credibility: dict,
    detected_language: str,
    verdict: Optional[str] = None,
    confidence: Optional[int] = None,
    analysis_reason: Optional[str] = None,
) -> Optional[str]:
    """Generate response using Gemini fallback"""
    gemini_client = get_gemini_client()
    gemini_model_name = get_gemini_model_name()
    if not gemini_client or not gemini_model_name:
        return None
    
    try:
        system_prompt = _build_system_prompt(detected_language)
        user_prompt = _build_user_prompt(
            user_input=user_input,
            mode=mode,
            extracted_claims=extracted_claims,
            research_topic=research_topic,
            search_results=search_results,
            source_credibility=source_credibility,
            verdict=verdict,
            confidence=confidence,
            analysis_reason=analysis_reason,
        )
        
        response = gemini_client.models.generate_content(
            model=gemini_model_name,
            contents=[system_prompt, user_prompt]
        )
        
        response_text = (response.text or "").strip()
        if len(response_text) > 0:
            return response_text
        
        logger.warning("Gemini returned empty response")
        return None
        
    except Exception as e:
        logger.error(f"Gemini generation failed: {e}")
        return None


def _build_system_prompt(language: str) -> str:
    """Build system prompt for Aura in the specified language"""
    
    if language.startswith("hi"):
        return """आप Aura हैं — एक तीक्ष्ण, ईमानदार फैक्ट-चेकिंग सहायक।

VERIFY MODE RESPONSE FORMAT (अनिवार्य):

1. VERDICT LINE (स्पष्ट, 1 line):
   ❌ False | ⚠️ Misleading | ✔️ Likely True | ❓ Unverified

2. WHY (2-3 short lines):
   क्या खोजा, कहाँ से आया

3. EVIDENCE (2-3 verified sources का नाम):
   • Reuters ने कहा...
   • BBC reported...

4. CLOSING (1 line):
   यह क्या मतलब है user के लिए

RULES:
- कभी raw URL मत दो
- Source नाम ही काफी है
- मध्यम जवाब: 60-120 words max
- Natural Hindi/Hinglish बोलो
- कभी JSON या metadata न दो

RESEARCH MODE:
- Topic explain करो (2-3 short paragraphs)
- Key points list करो
- आगे के सवाल के लिए open रहो"""
    else:
        # Default English
        return """You are Aura — a sharp, honest fact-checker. Your job is clarity, not essays.

VERIFY MODE RESPONSE FORMAT (mandatory):

1. VERDICT LINE (clear, 1 line):
   ❌ False | ⚠️ Misleading | ✔️ Likely True | ❓ Unverified

2. WHY (2-3 short lines):
   What you found and where it came from

3. EVIDENCE (2-3 trusted source names only):
   • Reuters reported...
   • BBC found...

4. CLOSING (1 line):
   What this means for the user

RULES:
- Never include raw URLs
- Source name only — no domains, titles, or metadata
- Keep it short: 60-120 words max
- Sound natural and confident
- No JSON, no metadata, no formatting

RESEARCH MODE:
- Explain the topic (2-3 short paragraphs)
- List key points
- Invite follow-up questions"""


def _build_user_prompt(
    user_input: str,
    mode: str,
    extracted_claims: list,
    research_topic: Optional[str],
    search_results: list,
    source_credibility: dict,
    verdict: Optional[str] = None,
    confidence: Optional[int] = None,
    analysis_reason: Optional[str] = None,
) -> str:
    """Build the user prompt with context. Cleaner metadata for better LLM output."""
    
    claims_text = "\n".join([f"- {claim}" for claim in extracted_claims]) if extracted_claims else f"- {user_input}"
    
    # Build sources section - only top 3, clean format
    usable_sources = [s for s in search_results if s.get("should_use", True)][:3]
    sources_list = []
    for src in usable_sources:
        # Only extract source name, no heavy metadata
        domain = src.get("domain", "unknown")
        title = src.get("title", "Source")
        # Prefer shorter domain name or title
        source_name = domain.split('.')[0].title() if '.' in domain else title[:30]
        sources_list.append(f"• {source_name}")
    
    sources_section = "\n".join(sources_list) if sources_list else "No trusted sources found"
    
    base_prompt = f"""ORIGINAL USER INPUT:
{user_input}

MODE: {mode}

EXTRACTED CLAIMS:
{claims_text}"""
    
    if mode == "research" or mode == "mixed":
        base_prompt += f"""

RESEARCH TOPIC:
{research_topic or 'General information requested'}"""
    
    if mode == "verify" or mode == "mixed":
        base_prompt += f"""

VERDICT INFORMATION:
- Final Verdict: {verdict or 'Analysis incomplete'}
- Confidence: {confidence or '0'}%

TRUSTED SOURCES (checked):
{sources_section}"""
        
        if analysis_reason:
            base_prompt += f"""

ANALYSIS CONTEXT (from fact-checking process):
{analysis_reason[:500]}"""
    
    base_prompt += f"""

Generate a natural, conversational response using the format specified in the system prompt.
Keep it direct and clear: 60-120 words is ideal.
If verdict is clear, state it and move on.
If evidence is weak, say that briefly.
Never add raw URLs or metadata.
"""
    
    return base_prompt


def _fallback_response(mode: str) -> str:
    """Fallback response when LLM generation fails"""
    if mode == "research":
        return "I couldn't generate a detailed response at the moment. Please try again in a moment."
    else:
        return "I was unable to complete the verification at this time. The evidence may be inconclusive — please try a different phrasing or check back later."
