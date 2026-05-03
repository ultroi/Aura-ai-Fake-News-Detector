#!/usr/bin/env python3
"""Quick test of Stage 4 final reasoning"""

import asyncio
import os
from app.services import llm_handler

async def test_stage4():
    """Test Stage 4 with sample data"""
    
    # Sample data
    original_claim = "India's population has exceeded 1.5 billion"
    extracted_claims = ["India's population has exceeded 1.5 billion"]
    
    # Sample search results (evaluated sources)
    search_results = [
        {
            "id": "s1",
            "title": "India Population 2024",
            "url": "https://example.com/india-pop",
            "domain": "example.com",
            "source_domain": "example.com",
            "credibility_score": 95,
            "credibility_tier": 1,
            "bias_indicator": "center",
            "relevance_score": 95,
            "stance_on_claim": "supports",
            "key_evidence": "Official census data shows India's population at 1.417 billion in 2024",
            "should_use": True,
            "snippet": "According to the latest census"
        },
        {
            "id": "s2",
            "title": "World Population Statistics",
            "url": "https://example.org/world-pop",
            "domain": "example.org",
            "source_domain": "example.org",
            "credibility_score": 88,
            "credibility_tier": 1,
            "bias_indicator": "center",
            "relevance_score": 80,
            "stance_on_claim": "supports",
            "key_evidence": "India is the most populous country with 1.4+ billion people",
            "should_use": True,
            "snippet": "India's population statistics"
        }
    ]
    
    # Sample source credibility evaluation
    source_credibility = {
        "claim": original_claim,
        "evaluated_sources": search_results,
        "usable_sources_count": 2,
        "overall_evidence_quality": "strong",
        "evidence_consensus": "supporting",
        "trusted_sources": [{"url": "https://example.com/india-pop"}],
        "suspicious_sources": [],
        "scored_sources": search_results,
    }
    
    print("Testing Stage 4 with sample data...")
    print(f"Claim: {original_claim}")
    print(f"Search results: {len(search_results)}")
    print(f"Source credibility keys: {source_credibility.keys()}")
    print()
    
    result = await llm_handler.analyze_claim(
        original_claim=original_claim,
        extracted_claims=extracted_claims,
        search_results=search_results,
        source_credibility=source_credibility,
    )
    
    print("Stage 4 Result:")
    print(f"Verdict: {result.get('verdict')}")
    print(f"Confidence: {result.get('confidence')}")
    print(f"Summary: {result.get('summary')}")
    print(f"Reason: {result.get('reason')[:200]}..." if result.get('reason') else "No reason")

if __name__ == "__main__":
    asyncio.run(test_stage4())
