#!/usr/bin/env python3
"""Test script to verify Groq and Gemini models are working"""

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

from app.services import (
    claim_extractor,
    search_query_generator,
    source_credibility,
    llm_handler
)


async def test_claim_extraction():
    """Test Stage 1: Claim extraction with Gemini"""
    print("\n" + "="*60)
    print("TEST 1: CLAIM EXTRACTION (Gemini)")
    print("="*60)
    
    test_claim = "UPI will shut down tomorrow in India"
    print(f"\nInput: {test_claim}")
    
    try:
        result = await claim_extractor.extract_claim(test_claim)
        
        if "error" in result:
            print(f"❌ ERROR: {result['error']}")
            return False
        
        print(f"✅ Detected Language: {result.get('detected_language')}")
        print(f"✅ Main Claim: {result.get('main_claim')}")
        print(f"✅ Entities: {result.get('entities')}")
        print(f"✅ Dates: {result.get('dates')}")
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False


async def test_search_queries():
    """Test Stage 2: Search query generation with Gemini"""
    print("\n" + "="*60)
    print("TEST 2: SEARCH QUERY GENERATION (Gemini)")
    print("="*60)
    
    claim = "COVID-19 was created in a lab"
    print(f"\nInput claim: {claim}")
    
    try:
        result = await search_query_generator.generate_search_queries(
            claim,
            entities=["COVID-19"],
            dates=[]
        )
        
        if "error" in result:
            print(f"❌ ERROR: {result['error']}")
            return False
        
        print(f"✅ Exact Query: {result.get('exact_query')}")
        print(f"✅ Fact-Check Queries: {result.get('factcheck_queries')}")
        print(f"✅ Official Source Query: {result.get('official_source_query')}")
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False


async def test_source_credibility():
    """Test Stage 3: Source credibility with Groq"""
    print("\n" + "="*60)
    print("TEST 3: SOURCE CREDIBILITY EVALUATION (Groq)")
    print("="*60)
    
    sample_sources = [
        {
            "title": "BBC News: COVID-19 Origins",
            "url": "https://bbc.com/news/covid",
            "source_domain": "bbc.com",
            "snippet": "Investigation into COVID-19 origins",
            "raw_content": "BBC investigation..."
        },
        {
            "title": "Random Blog: COVID Truth",
            "url": "https://randomblog.com/covid",
            "source_domain": "randomblog.com",
            "snippet": "The real truth about COVID",
            "raw_content": "Unverified claims..."
        }
    ]
    
    print(f"\nEvaluating {len(sample_sources)} sources...")
    
    try:
        result = await source_credibility.evaluate_sources(sample_sources)
        
        print(f"✅ Trusted Sources: {len(result.get('trusted_sources', []))}")
        print(f"✅ Suspicious Sources: {len(result.get('suspicious_sources', []))}")
        print(f"✅ Scored Sources: {len(result.get('scored_sources', []))}")
        
        for scored in result.get('scored_sources', [])[:2]:
            src = scored.get('source', {})
            print(f"   - {src.get('title', 'N/A')}: {scored.get('category')} (score: {scored.get('score')})")
        
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False


async def test_final_reasoning():
    """Test Stage 4: Final reasoning with Groq"""
    print("\n" + "="*60)
    print("TEST 4: FINAL REASONING (Groq - llama-3.3-70b-versatile)")
    print("="*60)
    
    sample_search_results = [
        {
            "title": "WHO Statement on COVID Origins",
            "url": "https://who.int/statement",
            "source_domain": "who.int",
            "snippet": "WHO investigation concludes natural origin is likely",
            "raw_content": "The WHO investigation team found evidence supporting natural zoonotic origin..."
        }
    ]
    
    sample_credibility = {
        "trusted_sources": [sample_search_results[0]],
        "suspicious_sources": [],
        "scored_sources": []
    }
    
    print("\nTesting with claim: 'COVID-19 was created in a lab'")
    
    try:
        result = await llm_handler.analyze_claim(
            original_claim="COVID-19 was created in a lab",
            extracted_claims=["COVID-19 was created in a laboratory"],
            search_results=sample_search_results,
            source_credibility=sample_credibility,
            translated_claim="COVID-19 was created in a lab"
        )
        
        print(f"\n✅ VERDICT: {result.get('verdict')}")
        print(f"✅ VERDICT DISPLAY: {result.get('verdict_display')}")
        print(f"✅ CONFIDENCE: {result.get('confidence')}%")
        print(f"\n✅ DETAILED REASONING:")
        print("-" * 60)
        reason = result.get('reason', '')
        # Show first 500 chars to verify length
        if len(reason) > 500:
            print(reason[:500] + "...[TRUNCATED]")
            print(f"\n[Full length: {len(reason)} characters]")
        else:
            print(reason)
        print("-" * 60)
        
        return len(reason) > 100  # Check if reasoning is substantial
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """Run all tests"""
    print("\n" + "🔍 AURA AI - MODEL VERIFICATION TEST" + "\n")
    
    tests = [
        ("Claim Extraction (Gemini)", test_claim_extraction),
        ("Search Query Generation (Gemini)", test_search_queries),
        ("Source Credibility (Groq)", test_source_credibility),
        ("Final Reasoning (Groq)", test_final_reasoning),
    ]
    
    results = {}
    
    for test_name, test_func in tests:
        try:
            passed = await test_func()
            results[test_name] = "✅ PASSED" if passed else "❌ FAILED"
        except Exception as e:
            results[test_name] = f"❌ ERROR: {str(e)}"
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    for test_name, status in results.items():
        print(f"{status} - {test_name}")
    
    passed_count = sum(1 for s in results.values() if "PASSED" in s)
    total_count = len(results)
    
    print(f"\nTotal: {passed_count}/{total_count} tests passed")
    
    if passed_count == total_count:
        print("\n🎉 All models are working correctly!")
        return 0
    else:
        print(f"\n⚠️ {total_count - passed_count} test(s) failed. Check API keys and network.")
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
