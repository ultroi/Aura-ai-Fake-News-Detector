"""Stage 4: Conversational response generator - generates human-like replies to users."""

import os
import json
import logging
from typing import Optional
from groq import Groq
from google import genai
from app.services.llm_json_parser import parse_llm_json

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
    except Exception:
        try:
            gemini_client = genai.Client(api_key=GEMINI_API_KEY)
            gemini_model_name = "gemini-3.1-flash-lite-preview"
        except Exception as e:
            logger.warning(f"Gemini config failed: {e}")
            gemini_client = None


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
) -> str:
    """
    Generate a natural, conversational response to the user.
    
    Args:
        user_input: User's original message
        mode: "verify", "research", or "mixed"
        extracted_claims: Claims extracted in Stage 1
        research_topic: Topic to research (if mode is research/mixed)
        search_results: Search results from Tavily
        source_credibility: Source evaluation from Stage 3
        detected_language: Language detected (en/hi/hinglish)
        verdict: Final verdict if in verify mode
        confidence: Confidence score if in verify mode
    
    Returns:
        Natural language response for the user
    """
    try:
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
        )
        
        if response_text:
            return response_text
        
        # Groq failed, try Gemini
        if gemini_client:
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
) -> Optional[str]:
    """Generate response using Groq"""
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
        )
        
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
) -> Optional[str]:
    """Generate response using Gemini fallback"""
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
        return """आप Aura हैं — एक तीक्ष्ण, ईमानदार, और बातचीत करने वाली तरह की फैक्ट-चेकिंग सहायक।

आप एक जानकार दोस्त की तरह बोलते हैं जो मीडिया साक्षरता और जांच-पड़ताल में विशेषज्ञ है।

आपके दो मोड हैं:

VERIFY MODE (जब यूजर किसी claim को सत्यापित करना चाहता है):
- सीधा और स्पष्ट verdict दें
- 2-3 प्राकृतिक पैराग्राफ में explain करें
- Sources को नाम से cite करें
- एक साफ समापन दें

RESEARCH MODE (जब यूजर किसी विषय के बारे में जानना चाहता है):
- पृष्ठभूमि और context explain करें
- 3-4 प्राकृतिक पैराग्राफ में मुख्य बातें समझाएं
- आगे के सवालों के लिए open रहें

PERSONALITY RULES:
- "मैं" (I) का प्राकृतिक रूप से use करें
- रोबोट की तरह नहीं, एक स्मार्ट दोस्त की तरह बोलें
- Uncertainty के बारे में सीधे कहें
- अपनी सोच दिखाएं
- जवाब मध्यम रखें: 2 छोटे पैराग्राफ या 1 छोटा पैराग्राफ + 3 bullets max
- कभी long-form essay न बनाएं
- सिर्फ जरूरी sources को अंत में bullets में दें
- कभी "जैसा कि एक AI" न कहें
- छोटे जवाब ठीक हैं, pad न करें"""
    else:
        # Default English
        return """You are Aura — a sharp, honest, and conversational fact-checker and research assistant.

You talk like a knowledgeable friend who happens to be an expert in media literacy and investigative research.

YOU HAVE TWO MODES:

VERIFY MODE (when user shares a claim and wants true/false verdict):
- Start with a natural opening reaction to the claim
- Give clear verdict in 1-2 sentences — don't bury it
- Explain in 1-2 short paragraphs what the evidence shows
- Cite sources by name ("According to Reuters...", "AltNews found...")
- End with a closing line about what they should know

RESEARCH MODE (when user asks about a topic):
- Acknowledge what they're asking about
- Explain in 2-3 short paragraphs
- Include only the most important context and nuances
- Invite further questions

PERSONALITY RULES:
- Talk like a human expert, not a report
- Use "I" naturally: "I found...", "I checked..."
- Be direct about uncertainty
- Keep responses medium-length: 2 short paragraphs max, or 1 short paragraph + up to 3 bullets
- Avoid long multi-paragraph essays
- Only add sources at the end if you actually checked real sources
- NEVER say "As an AI language model"
- Show your thinking naturally
- Keep responses focused — don't pad
- Match the user's tone and energy"""


def _build_user_prompt(
    user_input: str,
    mode: str,
    extracted_claims: list,
    research_topic: Optional[str],
    search_results: list,
    source_credibility: dict,
    verdict: Optional[str] = None,
    confidence: Optional[int] = None,
) -> str:
    """Build the user prompt with context"""
    
    claims_text = "\n".join([f"- {claim}" for claim in extracted_claims]) if extracted_claims else f"- {user_input}"
    
    # Build sources section
    usable_sources = [s for s in search_results if s.get("should_use", True)][:10]
    sources_list = []
    for src in usable_sources:
        domain = src.get("domain") or src.get("source_domain", "unknown")
        stance = src.get("stance_on_claim", "neutral")
        tier = src.get("credibility_tier", "unknown")
        title = src.get("title", "Source")
        sources_list.append(f"- {title} ({domain}) — Stance: {stance}, Tier: {tier}")
    
    sources_section = "\n".join(sources_list) if sources_list else "No sources found"
    
    # Build evidence section
    evidence_quality = source_credibility.get("overall_evidence_quality", "insufficient")
    evidence_consensus = source_credibility.get("evidence_consensus", "no consensus")
    usable_count = source_credibility.get("usable_sources_count", len(usable_sources))
    
    base_prompt = f"""ORIGINAL USER INPUT:
{user_input}

MODE: {mode}
DETECTED LANGUAGE: Based on context, respond in the same language/script as the user's input.

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
- Evidence Quality: {evidence_quality}
- Evidence Consensus: {evidence_consensus}
- Usable Sources: {usable_count}

CURATED SOURCES (High credibility only):
{sources_section}"""
    
    base_prompt += f"""

Now generate a natural, conversational response that directly answers the user's input.
Do NOT include any JSON, metadata, or system information.
Respond in a medium length: ideally 80-140 words.
If you found clear data, say it directly and stop.
If the evidence is weak or missing, say that briefly and suggest the next best source.
"""
    
    return base_prompt


def _fallback_response(mode: str) -> str:
    """Fallback response when LLM generation fails"""
    if mode == "research":
        return "I couldn't generate a detailed response at the moment. Please try again in a moment."
    else:
        return "I was unable to complete the verification at this time. The evidence may be inconclusive — please try a different phrasing or check back later."
