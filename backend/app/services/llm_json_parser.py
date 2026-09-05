"""Utilities for extracting and parsing JSON from LLM responses."""

from __future__ import annotations

import ast
import json
import re
from typing import Any, Optional


def extract_json_substring(text: str) -> Optional[str]:
    """Extract the most likely JSON object/array substring from an LLM response."""
    if not text:
        return None

    text = text.strip().lstrip("\ufeff")

    fenced_json = re.search(r"```\s*json\s*(.*?)```", text, flags=re.DOTALL | re.IGNORECASE)
    if fenced_json:
        candidate = fenced_json.group(1).strip()
        if candidate:
            return candidate

    fenced_block = re.search(r"```(.*?)```", text, flags=re.DOTALL)
    if fenced_block:
        candidate = fenced_block.group(1).strip()
        if candidate.startswith("{") or candidate.startswith("["):
            return candidate

    inline_block = re.search(r"`(\{.*?\}|\[.*?\])`", text, flags=re.DOTALL)
    if inline_block:
        return inline_block.group(1).strip()

    start_index = None
    stack: list[str] = []
    in_string = False
    escape = False
    opening_char = ""

    for index, char in enumerate(text):
        if start_index is None:
            if char in "[{":
                start_index = index
                opening_char = char
                stack.append(char)
            continue

        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue

        if char in "[{":
            stack.append(char)
            continue

        if char in "]}":
            if not stack:
                start_index = None
                opening_char = ""
                continue

            current = stack.pop()
            if (current == "{" and char != "}") or (current == "[" and char != "]"):
                start_index = None
                opening_char = ""
                stack.clear()
                in_string = False
                escape = False
                continue

            if not stack and start_index is not None:
                return text[start_index:index + 1].strip()

    # Last resort: return the first full line that looks like a JSON object
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    for line in lines:
        if line.startswith("{") and line.endswith("}"):
            return line

    return None


def repair_json_text(text: str) -> str:
    """Repair common LLM JSON formatting issues before json.loads."""
    if not text:
        return text

    text = text.strip().lstrip("\ufeff")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    text = text.replace("–", "-").replace("—", "-").replace("\u00a0", " ")
    text = re.sub(r",\s*(?=[}\]])", "", text)

    repaired: list[str] = []
    in_string = False
    escape = False

    for char in text:
        if in_string:
            if escape:
                repaired.append(char)
                escape = False
                continue

            if char == "\\":
                repaired.append(char)
                escape = True
                continue

            if char == '"':
                repaired.append(char)
                in_string = False
                continue

            if char == "\n":
                repaired.append("\\n")
                continue

            if char == "\t":
                repaired.append("\\t")
                continue

            if ord(char) < 0x20:
                repaired.append(f"\\u{ord(char):04x}")
                continue

            repaired.append(char)
            continue

        if char == '"':
            in_string = True
            repaired.append(char)
            continue

        repaired.append(char)

    return "".join(repaired).strip()


def normalize_json_like(text: str) -> str:
    """Convert JSON-like literals to Python-safe literals for ast.literal_eval."""
    if not text:
        return text

    repaired = text
    repaired = repaired.replace("null", "None")
    repaired = repaired.replace("true", "True")
    repaired = repaired.replace("false", "False")
    repaired = repaired.replace("None", "None")
    return repaired


def parse_llm_json(text: str) -> Any:
    """
    Extract, repair, and parse JSON from an LLM response.
    
    OPTIMIZATION: Robust JSON parsing with automatic repair
    - Handles common LLM JSON formatting errors
    - Multiple fallback strategies
    - Never fails the pipeline due to JSON issues
    """
    import logging
    logger = logging.getLogger(__name__)
    
    json_substring = extract_json_substring(text)
    if json_substring is None:
        json_substring = text.strip()
        if not json_substring:
            logger.warning("parse_llm_json: No JSON found in response, returning empty dict")
            return {}

    # STRATEGY 1: Direct JSON parsing
    try:
        result = json.loads(json_substring)
        return result
    except json.JSONDecodeError as e:
        logger.debug(f"Direct JSON parsing failed: {e}")

    # STRATEGY 2: Repair common issues then parse
    repaired = repair_json_text(json_substring)
    try:
        result = json.loads(repaired)
        logger.debug("JSON parsed after repair")
        return result
    except json.JSONDecodeError as e:
        logger.debug(f"Repaired JSON parsing failed: {e}")

    # STRATEGY 3: Python literal eval (single-quoted JSON)
    try:
        result = ast.literal_eval(repaired)
        logger.debug("JSON parsed with ast.literal_eval")
        return result
    except Exception as e:
        logger.debug(f"ast.literal_eval failed: {e}")

    # STRATEGY 4: Normalize JSON keywords (null → None, true → True, etc)
    try:
        repaired_normalized = normalize_json_like(repaired)
        result = ast.literal_eval(repaired_normalized)
        logger.debug("JSON parsed with normalized keywords")
        return result
    except Exception as e:
        logger.debug(f"Normalized ast.literal_eval failed: {e}")

    # STRATEGY 5: Fix quote mismatch (single → double quotes)
    try:
        repaired_quotes = repaired.replace("'", '"')
        result = json.loads(repaired_quotes)
        logger.debug("JSON parsed after quote conversion")
        return result
    except Exception as e:
        logger.debug(f"Quote conversion failed: {e}")

    # STRATEGY 6: Strip problematic outer characters and retry
    try:
        stripped = repaired.strip()
        while stripped and stripped[0] not in "[{" and stripped[-1] not in "]}":
            stripped = stripped[1:-1].strip()
            if not stripped:
                break
        if stripped and stripped[0] in "[{":
            result = json.loads(stripped)
            logger.debug("JSON parsed after stripping outer chars")
            return result
    except Exception as e:
        logger.debug(f"Strip-and-retry failed: {e}")

    # STRATEGY 7: Last resort - extract key-value pairs manually
    try:
        result = _extract_json_like_dict(repaired)
        if result:
            logger.debug("JSON extracted with manual key-value parsing")
            return result
    except Exception as e:
        logger.debug(f"Manual extraction failed: {e}")

    # FINAL FALLBACK: Return empty dict
    logger.warning(f"All JSON parsing strategies failed. Returning empty dict. Text (first 200 chars): {text[:200]}")
    return {}


def _extract_json_like_dict(text: str) -> Any:
    """
    Manual key-value extraction as last resort fallback.
    Attempts to extract a dictionary from unparseable JSON-like text.
    """
    # Try to find key: value patterns
    pattern = r'"([^"]+)"\s*:\s*([^,}]+)'
    matches = re.findall(pattern, text)
    
    if not matches:
        return None
    
    result = {}
    for key, value in matches:
        value = value.strip()
        # Try to parse the value
        if value.lower() == "true":
            result[key] = True
        elif value.lower() == "false":
            result[key] = False
        elif value == "null":
            result[key] = None
        elif value.startswith('"') and value.endswith('"'):
            result[key] = value[1:-1]
        elif value.isdigit():
            result[key] = int(value)
        else:
            try:
                result[key] = float(value)
            except:
                result[key] = value
    
    return result if result else None
