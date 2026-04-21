"""
Quality assessment for place descriptions — hybrid heuristic + LLM approach.

Step 1: Score every description candidate with zero API cost (heuristics).
Step 2: If top 2 candidates are within 0.15 of each other, call LLM to pick/synthesize.
Step 3: Return the winning description, its source, and score.
"""

from __future__ import annotations

import os
from typing import Any

from app.logger import get_logger

logger = get_logger(__name__)

# Source reliability weights (out of 0.4 — the max for this factor)
SOURCE_RELIABILITY = {
    "wikipedia": 0.40,
    "gmaps_editorial": 0.35,
    "wikidata": 0.25,
    "wikipedia_short": 0.15,
}

# Keywords that indicate specificity for pilgrimage/religious sites
SPECIFICITY_KEYWORDS = [
    "mosque",
    "church",
    "temple",
    "shrine",
    "cathedral",
    "synagogue",
    "pilgrimage",
    "holy",
    "sacred",
    "historic",
    "century",
    "built",
    "founded",
    "islamic",
    "christian",
    "hindu",
    "buddhist",
    "sikh",
    "worship",
    "prayer",
    "minaret",
    "dome",
    "heritage",
    "UNESCO",
    "ottoman",
    "mughal",
    "medieval",
    "ancient",
    "prophet",
    "saint",
]

LLM_TIE_BREAK_THRESHOLD = 0.15


def score_description(text: str, source: str, place_name: str = "") -> float:
    """
    Score a single description candidate using heuristics (0.0 – 1.0).

    Factors:
        - Source reliability (weight 0.4): How trustworthy is the source?
        - Length/detail (weight 0.3): Longer descriptions tend to be more informative.
        - Specificity (weight 0.3): Does it mention the place name and relevant keywords?
    """
    if not text or not text.strip():
        return 0.0

    # Factor 1: Source reliability (0.0 – 0.4)
    reliability = SOURCE_RELIABILITY.get(source, 0.10)

    # Factor 2: Length/detail (0.0 – 0.3)
    text_len = len(text.strip())
    if text_len > 300:
        length_score = 0.30
    elif text_len > 100:
        length_score = 0.20
    elif text_len > 30:
        length_score = 0.10
    else:
        length_score = 0.05

    # Factor 3: Specificity (0.0 – 0.3)
    specificity_score = 0.0

    # Check if place name is mentioned
    if place_name and place_name.lower() in text.lower():
        specificity_score += 0.15

    # Check for relevant keywords
    text_lower = text.lower()
    keyword_hits = sum(1 for kw in SPECIFICITY_KEYWORDS if kw in text_lower)
    specificity_score += min(keyword_hits * 0.03, 0.15)

    return round(reliability + length_score + specificity_score, 4)


async def assess_descriptions(
    candidates: list[dict[str, Any]],
    place_name: str = "",
) -> dict[str, Any]:
    """
    Assess all description candidates and return the best one.

    Args:
        candidates: List of {"text": str, "lang": str, "source": str, "score": float|None}
        place_name: Place display name (for specificity scoring)

    Returns:
        {
            "text": str,
            "source": str,
            "score": float,
            "method": "heuristic" | "llm",
        }
    """
    if not candidates:
        return {"text": "", "source": "none", "score": 0.0, "method": "heuristic"}

    # Filter to English descriptions only for primary assessment
    en_candidates = [c for c in candidates if c.get("lang", "en") == "en"]
    if not en_candidates:
        en_candidates = candidates  # fallback: use whatever we have

    # Score each candidate
    scored = []
    for c in en_candidates:
        text = c.get("text", "")
        source = c.get("source", "unknown")
        score = score_description(text, source, place_name)
        scored.append({"text": text, "source": source, "score": score})

    # Sort by score descending
    scored.sort(key=lambda x: x["score"], reverse=True)

    best = scored[0]

    # Check if LLM tie-breaking is needed
    if (
        len(scored) >= 2
        and (scored[0]["score"] - scored[1]["score"]) < LLM_TIE_BREAK_THRESHOLD
        and os.environ.get("GEMINI_API_KEY")
    ):
        llm_result = await _llm_tiebreak(scored[0], scored[1], place_name)
        if llm_result:
            return llm_result

    return {
        "text": best["text"],
        "source": best["source"],
        "score": best["score"],
        "method": "heuristic",
    }


async def _llm_tiebreak(
    candidate_a: dict[str, Any],
    candidate_b: dict[str, Any],
    place_name: str,
) -> dict[str, Any] | None:
    """
    Use Gemini to break a tie between two close description candidates.

    Runs asynchronously so multiple per-place tie-breaks can proceed in
    parallel when many places are being enriched concurrently.

    Returns the LLM's choice or None if the call fails.
    """
    try:
        import json

        from google import genai
        from google.genai import types

        api_key = os.environ.get("GEMINI_API_KEY")
        client = genai.Client(api_key=api_key)

        prompt = f"""You are evaluating two descriptions for "{place_name}", a pilgrimage/religious site.

Description A (source: {candidate_a["source"]}, score: {candidate_a["score"]:.2f}):
"{candidate_a["text"]}"

Description B (source: {candidate_b["source"]}, score: {candidate_b["score"]:.2f}):
"{candidate_b["text"]}"

Pick the most informative, accurate, and contextually rich description. If both have complementary information, you may synthesize a combined description.

Respond in this exact JSON format:
{{"choice": "A" or "B" or "synthesized", "text": "the chosen or synthesized description"}}"""

        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        content = response.text.strip()

        parsed = json.loads(content)
        choice = parsed.get("choice", "")
        text = parsed.get("text", "")

        if choice == "A":
            source = candidate_a["source"]
            score = candidate_a["score"]
        elif choice == "B":
            source = candidate_b["source"]
            score = candidate_b["score"]
        elif choice == "synthesized":
            source = "llm_synthesized"
            score = max(candidate_a["score"], candidate_b["score"])
        else:
            return None

        return {
            "text": text if text else candidate_a["text"],
            "source": source,
            "score": score,
            "method": "llm",
        }

    except Exception as e:
        logger.warning("LLM tie-breaking failed: %s", e)
        return None
