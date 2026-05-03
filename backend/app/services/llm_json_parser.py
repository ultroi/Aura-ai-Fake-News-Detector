"""Utilities for extracting and parsing JSON from LLM responses."""

from __future__ import annotations

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


def parse_llm_json(text: str) -> Any:
    """Extract, repair, and parse JSON from an LLM response."""
    json_substring = extract_json_substring(text)
    if json_substring is None:
        raise json.JSONDecodeError("No JSON object found in response", text, 0)

    try:
        return json.loads(json_substring)
    except json.JSONDecodeError:
        repaired = repair_json_text(json_substring)
        return json.loads(repaired)
