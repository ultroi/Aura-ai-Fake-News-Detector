"""Analysis routes for the 4-stage misinformation verification pipeline"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, validator, root_validator
from typing import Optional, List
import asyncio
from app.services import (
    claim_extractor,
    image_ocr,
    search_query_generator,
    tavily_search,
    source_credibility,
    llm_handler,
    response_generator,
    url_handler
)
from app.services.llm_clients import activate_prompt_groq_cap, reset_prompt_groq_cap
import logging
import re

router = APIRouter(prefix="/analyze", tags=["analysis"])
logger = logging.getLogger(__name__)


def _build_fallback_response(verdict: str, analysis_result: dict, sources: list, language: str) -> str:
    """Build a fallback response when Stage 4 reasoning is unavailable"""
    if not verdict:
        return "Unable to determine verdict with available evidence."
    
    verdict_text = {
        "true": "This claim appears to be TRUE",
        "likely_true": "This claim is LIKELY TRUE",
        "misleading": "This claim is MISLEADING",
        "likely_fake": "This claim is LIKELY FALSE",
        "fake": "This claim is FALSE",
        "unverified": "This claim cannot be verified"
    }.get(verdict, "Unable to determine")
    
    source_count = len(sources) if sources else 0
    source_text = f"Based on {source_count} sources found" if source_count > 0 else "Insufficient sources found"
    
    return f"{verdict_text} based on our fact-checking analysis. {source_text}."


async def _search_single_claim(claim_item: dict, entities: List[str], dates: List[str], mode: str) -> dict:
    """
    OPTIMIZATION: Helper function for concurrent claim searching
    Searches a single claim and returns results
    Allows asyncio.gather() to process multiple claims in parallel
    """
    try:
        queries = await search_query_generator.generate_search_queries(
            claim_item,
            entities,
            dates,
            mode=mode
        )
        logger.info(f"Generated {mode} mode queries for {claim_item.get('id', 'c1')}")
        
        search_results_by_type = await tavily_search.search_multiple_queries(queries)
        combined = search_results_by_type.get("combined_results", [])
        logger.info(f"Found {len(combined)} results for {claim_item.get('id', 'c1')}")
        
        return combined
    except Exception as e:
        logger.error(f"Error searching claim {claim_item.get('id')}: {e}")
        return []

async def ensure_client_connected(request: Request):
    if await request.is_disconnected():
        raise HTTPException(status_code=499, detail="Client disconnected")


def normalize_url(source: dict) -> Optional[str]:
    """Normalize source URLs: extract from URL field, construct from domain, or return None."""
    url = source.get("url")
    if url and isinstance(url, str) and url.strip():
        return url.strip()
    
    domain = source.get("domain")
    if domain and isinstance(domain, str) and domain.strip():
        # Construct proper URL from domain
        domain = domain.strip()
        if not domain.startswith(("http://", "https://")):
            domain = f"https://{domain}"
        return domain
    
    return None


# Configuration
MAX_QUERY_LENGTH = 2000
MAX_IMAGES = 5
ALLOWED_MODES = ['verify', 'research', 'mixed']


class AnalysisRequest(BaseModel):
    query: Optional[str] = Field(None, max_length=MAX_QUERY_LENGTH, description="Claim or question to analyze")
    url: Optional[str] = Field(None, description="URL to fetch and analyze")
    images: Optional[List[str]] = Field(None, description="Optional base64-encoded images")
    mode: Optional[str] = Field('verify', description="verify, research, or mixed")
    language_hint: Optional[str] = Field(None, description="en, hi, or hinglish")
    user_id: Optional[str] = None
    
    @validator('query')
    def validate_query(cls, v):
        if v and len(v.strip()) == 0:
            return None
        return v.strip() if v else None
    
    @validator('mode')
    def validate_mode(cls, v):
        if v and v not in ALLOWED_MODES:
            raise ValueError(f'Mode must be one of: {ALLOWED_MODES}')
        return v or 'verify'
    
    @validator('images')
    def validate_images(cls, v):
        if not v:
            return None
        if len(v) > MAX_IMAGES:
            raise ValueError(f'Maximum {MAX_IMAGES} images allowed')
        return v
    
    @validator('url')
    def validate_url(cls, v):
        if not v:
            return None
        if not url_handler.is_valid_url(v):
            raise ValueError('Invalid URL format')
        return v
    
    @root_validator(skip_on_failure=True)
    def check_input_provided(cls, values):
        query = values.get('query')
        url = values.get('url')
        images = values.get('images')
        if not query and not url and not images:
            raise ValueError('Provide text, URL, or image(s) for analysis')
        return values


class AnalysisResponse(BaseModel):
    mode: str = Field(..., description="verify, research, or mixed")
    response: str = Field(..., description="Conversational response from Aura")
    short_summary: Optional[str] = Field(None, description="One-sentence verdict summary for UI display")
    reason: Optional[str] = Field(None, description="Full explanation and evidence from analysis")
    extracted_image_texts: Optional[List[str]] = Field(None, description="Text extracted from attached images")
    verdict: Optional[str] = Field(None, description="true, likely_true, misleading, likely_fake, fake, unverified")
    verdict_display: Optional[str] = Field(None, description="Display-friendly verdict")
    confidence: Optional[int] = Field(None, ge=0, le=100, description="Confidence 0-100")
    reasoning: Optional[dict] = Field(None, description="Detailed reasoning")
    key_facts: Optional[List[str]] = Field(None, description="Key verifiable facts")
    important_context: Optional[str] = Field(None, description="Critical context")
    trusted_sources: List[str] = Field(default_factory=list, description="High-credibility sources")
    suspicious_sources: List[str] = Field(default_factory=list, description="Low-credibility sources")
    sources_count: dict = Field(default_factory=lambda: {"trusted": 0, "suspicious": 0})
    source_url: Optional[str] = Field(None, description="URL that was analyzed")


@router.post("", response_model=AnalysisResponse)
async def analyze_claim(request: Request, payload: AnalysisRequest):
    """
    Analyze a claim using 4-stage misinformation verification pipeline.

    STAGE 1: Claim Extraction
    - Extract main factual claims from multilingual input
    - Detect language (EN/HI/Hinglish)
    - Extract entities, dates, locations
    - Process images if provided
    
    STAGE 2: Search Query Generation & Tavily Search
    - Generate optimized search queries (considering images)
    - Search using Tavily API
    - Combine results for maximum coverage
    
    STAGE 3: Source Credibility Evaluation
    - Evaluate each source's trustworthiness
    - Categorize as trusted/moderate/suspicious/unreliable
    
    STAGE 4: Final LLM Analysis
    - Analyze with 6-tier verdict system
    - Generate detailed reasoning

    Args:
        request: Contains the query/claim, optional images, mode, and language hint

    Returns:
        AnalysisResponse with verdict, confidence, reasoning, and sources
    """
    import time
    pipeline_start = time.time()
    stage_times = {}
    
    cap_token = activate_prompt_groq_cap(payload.query)
    try:
        await ensure_client_connected(request)

        # Handle URL input and combine with query when both are provided
        analysis_input = payload.query
        source_url = None
        
        if payload.url:
            stage0_start = time.time()
            logger.info(f"=== STAGE 0: URL Fetching ===")
            logger.info(f"Fetching content from: {payload.url}")
            
            url_result = await url_handler.fetch_url_content(payload.url)
            
            if not url_result.get("success"):
                if payload.query:
                    logger.warning(f"URL fetch failed, continuing with query only: {url_result.get('error', 'Unknown error')}")
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Failed to fetch URL: {url_result.get('error', 'Unknown error')}"
                    )
            else:
                url_content = url_result.get("content")
                source_url = payload.url
                if analysis_input:
                    analysis_input = f"{analysis_input}\n\nURL CONTENT:\n{url_content}"
                else:
                    analysis_input = url_content
                logger.info(f"Extracted {len(url_content)} characters from URL")
            
            stage_times["stage_0"] = time.time() - stage0_start
        
        image_texts = []
        if payload.images:
            await ensure_client_connected(request)
            logger.info(f"Images provided: {len(payload.images)}")
            image_texts = await image_ocr.extract_texts_from_images(payload.images)
            if image_texts:
                image_text_block = "\n\n".join(
                    [f"IMAGE {idx + 1} TEXT:\n{text}" for idx, text in enumerate(image_texts)]
                )
                if analysis_input:
                    analysis_input = f"{analysis_input}\n\n{image_text_block}"
                else:
                    analysis_input = image_text_block

        if not analysis_input or len(analysis_input.strip()) == 0:
            raise HTTPException(status_code=400, detail="Input cannot be empty")

        await ensure_client_connected(request)
        stage1_start = time.time()
        logger.info(f"=== STAGE 1: Claim Extraction ===")
        logger.info(f"Input length: {len(analysis_input)} chars")
        if payload.images:
            logger.info(f"Images provided: {len(payload.images)}")
        
        # STAGE 1: Extract claims
        extraction_result = await claim_extractor.extract_claim(analysis_input)
        stage_times["stage_1"] = time.time() - stage1_start
        
        if "error" in extraction_result:
            logger.warning(f"Extraction error: {extraction_result.get('error')}")
            # Continue with fallback
        
        claims = extraction_result.get("claims", []) or []
        extracted_claims = extraction_result.get("extracted_claims", [payload.query])
        main_claim = extraction_result.get("main_claim", payload.query)
        translated_claim = extraction_result.get("translated_claim", main_claim)
        detected_lang = extraction_result.get("detected_language", "en")
        entities = extraction_result.get("entities", [])
        dates = extraction_result.get("dates", [])
        
        logger.info(f"Stage 1 Complete ({stage_times['stage_1']:.2f}s) - Detected language: {detected_lang}, {len(extracted_claims)} claim(s)")
        
        # Get mode and research topic from extraction
        mode = extraction_result.get("mode", "verify")
        research_topic = extraction_result.get("research_topic")
        
        logger.info(f"=== STAGE 2: Search Query Generation & Tavily Search ===")
        stage2_start = time.time()
        logger.info(f"Mode: {mode}")
        
        combined_results = []
        all_query_bundles = []

        claims_to_search = claims[:5] if claims else [{"id": "c1", "claim": main_claim}]
        
        # OPTIMIZATION: Search multiple claims CONCURRENTLY with asyncio.gather()
        # WHY: Old code searched claims sequentially (claim 1 → claim 2 → claim 3)
        # New: All claims search in parallel (claim 1, 2, 3 at same time)
        # Performance: ~6 seconds vs ~15 seconds for 3-5 claims
        logger.info(f"=== STAGE 2: Searching {len(claims_to_search)} claims concurrently ===")
        
        # Create concurrent search tasks for all claims
        search_tasks = [
            _search_single_claim(claim_item, entities, dates, mode)
            for claim_item in claims_to_search
        ]
        
        # Execute all searches in parallel
        await ensure_client_connected(request)
        search_results_list = await asyncio.gather(*search_tasks, return_exceptions=True)
        
        # Collect results from all searches
        for result in search_results_list:
            if isinstance(result, list):
                combined_results.extend(result)
            elif isinstance(result, Exception):
                logger.warning(f"One claim search failed: {result}")
        
        combined_results = tavily_search._deduplicate_results(combined_results)
        
        stage_times["stage_2"] = time.time() - stage2_start
        logger.info(f"Stage 2 Complete ({stage_times['stage_2']:.2f}s) - Found {len(combined_results)} unique sources from {len(claims_to_search)} claim(s)")
        
        # STAGE 3: Evaluate source credibility (only needed for verify mode)
        credibility_eval = {}
        usable_sources = []
        verdict = None
        confidence = None
        analysis_result = None
        
        if mode in ["verify", "mixed"]:
            await ensure_client_connected(request)
            stage3_start = time.time()
            logger.info(f"=== STAGE 3: Source Credibility Evaluation ===")
            
            credibility_eval = await source_credibility.evaluate_sources(combined_results, claim=main_claim)
            
            stage_times["stage_3"] = time.time() - stage3_start
            trusted_count = len(credibility_eval.get("trusted_sources", []))
            suspicious_count = len(credibility_eval.get("suspicious_sources", []))
            logger.info(f"Stage 3 Complete ({stage_times['stage_3']:.2f}s) - {trusted_count} trusted, {suspicious_count} suspicious")

            usable_sources = [source for source in credibility_eval.get("evaluated_sources", []) if source.get("should_use")]
            
            # STAGE 4: Get verdict for verify mode
            stage4_start = time.time()
            logger.info(f"=== STAGE 4: Final LLM Analysis (Verdict + Response) ===")
            
            analysis_result = await llm_handler.analyze_claim(
                original_claim=payload.query,
                extracted_claims=extracted_claims,
                search_results=usable_sources,
                source_credibility=credibility_eval,
                translated_claim=translated_claim
            )
            
            stage_times["stage_4"] = time.time() - stage4_start
            verdict = analysis_result.get("verdict")
            confidence = analysis_result.get("confidence")
            logger.info(f"Stage 4 Complete ({stage_times['stage_4']:.2f}s) - Verdict: {verdict} (confidence: {confidence}%)")
        else:
            # Research mode - use all combined results
            usable_sources = combined_results[:20]
            credibility_eval = {
                "trusted_sources": [],
                "suspicious_sources": [],
                "evaluated_sources": usable_sources,
                "overall_evidence_quality": "sufficient",
                "evidence_consensus": "no_consensus",
                "usable_sources_count": len(usable_sources)
            }
        
        await ensure_client_connected(request)
        # OPTIMIZATION: Merged Stage 4 and Stage 5
        # WHY: Eliminated redundant response_generator LLM call (saves ~1 minute)
        # Stage 4 analysis already includes detailed reasoning for user response
        # Instead of: Stage 4 (verdict) → Stage 5 (response), now: Stage 4 (verdict + reasoning) → format and return
        logger.info(f"=== Stage 4-5 Merged: Final Response ===")
        
        # Use analysis_result reasoning directly as conversational response
        if analysis_result and analysis_result.get("reason"):
            # Verdict is already in user-friendly format from Stage 4
            conversational_response = analysis_result.get("reason")
        else:
            # Fallback: Build simple response from verdict
            conversational_response = _build_fallback_response(verdict, analysis_result, usable_sources, detected_lang)
        
        # Stage 4-5 response is the primary output now
        response_text = conversational_response

        # Format and return response
        # Normalize trusted/suspicious sources to lists of URLs using normalize_url function
        trusted_list = []
        suspicious_list = []
        for s in credibility_eval.get("trusted_sources", []):
            if isinstance(s, dict):
                url = normalize_url(s)
                if url:
                    trusted_list.append(url)
            elif isinstance(s, str) and s:
                trusted_list.append(s)

        for s in credibility_eval.get("suspicious_sources", []):
            if isinstance(s, dict):
                url = normalize_url(s)
                if url:
                    suspicious_list.append(url)
            elif isinstance(s, str) and s:
                suspicious_list.append(s)

        response_dict = {
            "mode": mode,
            "response": response_text,
            "short_summary": analysis_result.get("short_summary") if analysis_result else None,
            "reason": analysis_result.get("reason") if analysis_result else None,
            "extracted_image_texts": image_texts if image_texts else None,
            "trusted_sources": trusted_list,
            "suspicious_sources": suspicious_list,
            "sources_count": {
                "trusted": len(trusted_list),
                "suspicious": len(suspicious_list)
            }
        }
        
        # Add source URL if analyzing a link
        if source_url:
            response_dict["source_url"] = source_url
        
        # Add verdict info if in verify mode
        if mode in ["verify", "mixed"] and verdict:
            response_dict["verdict"] = verdict
            response_dict["confidence"] = confidence
            # Map verdict to display name
            verdict_map = {
                "true": "TRUE",
                "likely_true": "LIKELY TRUE",
                "misleading": "MISLEADING",
                "likely_fake": "LIKELY FAKE",
                "fake": "FAKE",
                "unverified": "UNVERIFIED"
            }
            response_dict["verdict_display"] = verdict_map.get(verdict, "UNVERIFIED")
            # Add reasoning details if available
            if isinstance(analysis_result, dict) and "reasoning" in analysis_result:
                response_dict["reasoning"] = analysis_result.get("reasoning")
            if isinstance(analysis_result, dict) and "key_facts" in analysis_result:
                response_dict["key_facts"] = analysis_result.get("key_facts")
            if isinstance(analysis_result, dict) and "important_context" in analysis_result:
                response_dict["important_context"] = analysis_result.get("important_context")
        
        # Log performance metrics
        total_time = time.time() - pipeline_start
        logger.info("=" * 60)
        logger.info("PERFORMANCE SUMMARY:")
        if "stage_1" in stage_times:
            logger.info(f"  Stage 1 (Claim Extraction):        {stage_times['stage_1']:.2f}s")
        if "stage_2" in stage_times:
            logger.info(f"  Stage 2 (Search):                  {stage_times['stage_2']:.2f}s")
        if "stage_3" in stage_times:
            logger.info(f"  Stage 3 (Source Credibility):      {stage_times['stage_3']:.2f}s")
        if "stage_4" in stage_times:
            logger.info(f"  Stage 4 (LLM Analysis):            {stage_times['stage_4']:.2f}s")
        logger.info(f"  TOTAL PIPELINE TIME:               {total_time:.2f}s")
        logger.info("=" * 60)
        
        return AnalysisResponse(**response_dict)

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
    except Exception as e:
        logger.error(f"Error analyzing claim: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error analyzing claim: {str(e)}"
        )
    finally:
        reset_prompt_groq_cap(cap_token)


class VerifyRequest(BaseModel):
    claim: str


@router.post("/verify_claim")
async def verify_claim(request: VerifyRequest):
    """
    Verify claim endpoint that follows strict pipeline and returns JSON per spec.

    Returns JSON:
    {
      "original_claim":"",
      "normalized_claim":"",
      "verdict":"",
      "confidence":"",
      "reason":"",
      "matched_sources":[{ "title":"","source":"","credibility":"" }],
      "ignored_sources":[{ "title":"","reason":"irrelevant" }]
    }
    """
    cap_token = activate_prompt_groq_cap(request.claim)
    try:
        if not request.claim or len(request.claim.strip()) == 0:
            raise HTTPException(status_code=400, detail="Claim cannot be empty")

        original = request.claim

        # STEP 1 & 2: Language detection and claim extraction
        extraction = await claim_extractor.extract_claim(original)

        original_language = extraction.get("detected_language", "en")
        claims = extraction.get("claims", []) or []
        normalized_claim = extraction.get("translated_claim", extraction.get("main_claim", original))
        main_claim = extraction.get("main_claim", original)
        entities = extraction.get("entities", [])
        dates = extraction.get("dates", [])

        # STEP 3: Generate queries per extracted claim
        combined_results = []
        claims_to_search = claims[:5] if claims else [{"id": "c1", "claim": main_claim}]
        for claim_item in claims_to_search:
            queries = await search_query_generator.generate_search_queries(claim_item, entities, dates)
            search_results_by_type = await tavily_search.search_multiple_queries(queries)
            combined_results.extend(search_results_by_type.get("combined_results", []))

        combined_results = tavily_search._deduplicate_results(combined_results)

        # STEP 4: Evaluate source credibility
        credibility = await source_credibility.evaluate_sources(combined_results, claim=main_claim)

        usable_sources = [source for source in credibility.get("evaluated_sources", []) if source.get("should_use")]

        # STEP 5: Strict evidence matching / source labeling
        matched_sources = []
        ignored_sources = []
        for res in credibility.get("evaluated_sources", []):
            source_entry = {
                "title": res.get("title", ""),
                "source": res.get("domain", ""),
                "credibility": f"tier_{res.get('credibility_tier', 4)}",
            }
            if res.get("should_use"):
                matched_sources.append(source_entry)
            else:
                ignored_sources.append({"title": res.get("title", ""), "reason": "not recommended for final verdict"})

        # STEP 6: Final reasoning with Groq using only relevant evidence
        analysis_result = await llm_handler.analyze_claim(
            original_claim=original,
            extracted_claims=extraction.get("extracted_claims", [main_claim]),
            search_results=usable_sources,
            source_credibility=credibility,
            translated_claim=normalized_claim
        )

        verdict = analysis_result.get("verdict", "unverified")
        reason = analysis_result.get("reason", "")
        
        # Format verdict message naturally - like ChatGPT explains
        verdict_display_map = {
            "verified_true": "✅ This claim is **verified as true**.",
            "likely_true": "✔️ This claim is **likely true** based on available evidence.",
            "misleading": "⚠️ This claim is **misleading** - it contains partial truths but lacks important context.",
            "likely_fake": "❌ This claim is **likely false** based on evidence.",
            "fake": "❌ This claim is **confirmed false** by reliable sources.",
            "unverified": "❓ This claim **cannot be verified** with current information."
        }
        
        verdict_intro = verdict_display_map.get(verdict, "This claim is unverified.")
        
        # Combine verdict intro with reasoning
        full_response = f"{verdict_intro}\n\n{reason}"

        # Construct final JSON per spec - no confidence exposed to frontend
        response = {
            "original_claim": original,
            "normalized_claim": normalized_claim,
            "verdict": verdict,
            "reason": full_response,  # Chat-like natural explanation
            "summary": full_response,  # For App.jsx compatibility
            "matched_sources": matched_sources,
            "ignored_sources": ignored_sources,
            "trusted_sources": [s.get("url", "") for s in credibility.get("trusted_sources", [])[:5]],
            "suspicious_sources": [s.get("url", "") for s in credibility.get("suspicious_sources", [])[:5]],
        }

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in verify_claim: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error verifying claim: {str(e)}")
    finally:
        reset_prompt_groq_cap(cap_token)
