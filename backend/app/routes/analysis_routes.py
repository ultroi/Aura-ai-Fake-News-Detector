"""Analysis routes for the 4-stage misinformation verification pipeline"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services import (
    claim_extractor,
    search_query_generator,
    tavily_search,
    source_credibility,
    llm_handler,
    response_generator
)
import logging

router = APIRouter(prefix="/analyze", tags=["analysis"])
logger = logging.getLogger(__name__)


class AnalysisRequest(BaseModel):
    query: str


class AnalysisResponse(BaseModel):
    mode: str  # "verify" | "research" | "mixed"
    response: str  # Conversational response from Aura
    verdict: Optional[str] = None  # Only if mode is verify or mixed
    verdict_display: Optional[str] = None
    confidence: Optional[int] = None
    trusted_sources: list[str] = []
    suspicious_sources: list[str] = []
    sources_count: dict = {"trusted": 0, "suspicious": 0}


@router.post("", response_model=AnalysisResponse)
async def analyze_claim(request: AnalysisRequest):
    """
    Analyze a claim using 4-stage misinformation verification pipeline.

    STAGE 1: Claim Extraction
    - Extract main factual claims from multilingual input
    - Detect language (EN/HI/Hinglish)
    - Extract entities, dates, locations
    
    STAGE 2: Search Query Generation & Tavily Search
    - Generate optimized search queries
    - Search using Tavily API
    - Combine results for maximum coverage
    
    STAGE 3: Source Credibility Evaluation
    - Evaluate each source's trustworthiness
    - Categorize as trusted/moderate/suspicious/unreliable
    
    STAGE 4: Final LLM Analysis
    - Analyze with 6-tier verdict system
    - Generate detailed reasoning

    Args:
        request: Contains the query/claim to analyze

    Returns:
        AnalysisResponse with 6-tier verdict, confidence, reasoning, and sources
    """
    try:
        if not request.query or len(request.query.strip()) == 0:
            raise HTTPException(status_code=400, detail="Query cannot be empty")

        logger.info(f"=== STAGE 1: Claim Extraction ===")
        logger.info(f"Input: {request.query}")
        
        # STAGE 1: Extract claims
        extraction_result = await claim_extractor.extract_claim(request.query)
        
        if "error" in extraction_result:
            logger.warning(f"Extraction error: {extraction_result.get('error')}")
            # Continue with fallback
        
        claims = extraction_result.get("claims", []) or []
        extracted_claims = extraction_result.get("extracted_claims", [request.query])
        main_claim = extraction_result.get("main_claim", request.query)
        translated_claim = extraction_result.get("translated_claim", main_claim)
        detected_lang = extraction_result.get("detected_language", "en")
        entities = extraction_result.get("entities", [])
        dates = extraction_result.get("dates", [])
        
        logger.info(f"Detected language: {detected_lang}")
        logger.info(f"Main claim: {main_claim}")
        logger.info(f"Extracted {len(extracted_claims)} claim(s)")
        
        # Get mode and research topic from extraction
        mode = extraction_result.get("mode", "verify")
        research_topic = extraction_result.get("research_topic")
        
        logger.info(f"=== STAGE 2: Search Query Generation ===")
        logger.info(f"Mode: {mode}")
        
        combined_results = []
        all_query_bundles = []

        claims_to_search = claims[:5] if claims else [{"id": "c1", "claim": main_claim}]
        for claim_item in claims_to_search:
            queries = await search_query_generator.generate_search_queries(
                claim_item,
                entities,
                dates,
                mode=mode
            )
            all_query_bundles.append(queries)
            logger.info(f"Generated {mode} mode queries for {claim_item.get('id', 'c1')}")

            # STAGE 2b: Search with Tavily
            logger.info(f"=== STAGE 2b: Tavily Search ===")

            search_results_by_type = await tavily_search.search_multiple_queries(queries)
            combined_results.extend(search_results_by_type.get("combined_results", []))

        combined_results = tavily_search._deduplicate_results(combined_results)
        
        logger.info(f"Tavily returned {len(combined_results)} combined search results")
        
        if not combined_results:
            logger.warning("No search results found")
            combined_results = []
        
        # STAGE 3: Evaluate source credibility (only needed for verify mode)
        credibility_eval = {}
        usable_sources = []
        verdict = None
        confidence = None
        
        if mode in ["verify", "mixed"]:
            logger.info(f"=== STAGE 3: Source Credibility Evaluation ===")
            
            credibility_eval = await source_credibility.evaluate_sources(combined_results, claim=main_claim)
            
            trusted_count = len(credibility_eval.get("trusted_sources", []))
            suspicious_count = len(credibility_eval.get("suspicious_sources", []))
            logger.info(f"Source evaluation: {trusted_count} trusted, {suspicious_count} suspicious")

            usable_sources = [source for source in credibility_eval.get("evaluated_sources", []) if source.get("should_use")]
            
            # STAGE 4: Get verdict for verify mode
            logger.info(f"=== STAGE 4: Final LLM Analysis (Verdict) ===")
            
            analysis_result = await llm_handler.analyze_claim(
                original_claim=request.query,
                extracted_claims=extracted_claims,
                search_results=usable_sources,
                source_credibility=credibility_eval,
                translated_claim=translated_claim
            )
            
            verdict = analysis_result.get("verdict")
            confidence = analysis_result.get("confidence")
            logger.info(f"Verdict: {verdict} (confidence: {confidence}%)")
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
        
        # STAGE 5: Generate conversational response
        logger.info(f"=== STAGE 5: Generate Conversational Response ===")
        
        conversational_response = await response_generator.generate_response(
            user_input=request.query,
            mode=mode,
            extracted_claims=extracted_claims,
            research_topic=research_topic,
            search_results=usable_sources,
            source_credibility=credibility_eval,
            detected_language=detected_lang,
            verdict=verdict,
            confidence=confidence,
        )
        
        # Format and return response
        # Normalize trusted/suspicious sources to lists of strings (URLs) for API response
        trusted_list = []
        suspicious_list = []
        for s in credibility_eval.get("trusted_sources", []):
            if isinstance(s, dict):
                url = s.get("url") or s.get("domain") or s.get("title")
                if url:
                    trusted_list.append(url)
            elif isinstance(s, str) and s:
                trusted_list.append(s)

        for s in credibility_eval.get("suspicious_sources", []):
            if isinstance(s, dict):
                url = s.get("url") or s.get("domain") or s.get("title")
                if url:
                    suspicious_list.append(url)
            elif isinstance(s, str) and s:
                suspicious_list.append(s)

        response_dict = {
            "mode": mode,
            "response": conversational_response,
            "trusted_sources": trusted_list,
            "suspicious_sources": suspicious_list,
            "sources_count": {
                "trusted": len(trusted_list),
                "suspicious": len(suspicious_list)
            }
        }
        
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
        
        return AnalysisResponse(**response_dict)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing claim: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error analyzing claim: {str(e)}"
        )


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
            "suspicious_sources": [s.get("url", "") for s in credibility.get("suspicious_sources", [])[:5]]
        }

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in verify_claim: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error verifying claim: {str(e)}")
