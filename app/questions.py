"""Load questions/answers/video mappings from the pre-extracted JSON."""

import json
import random
from pathlib import Path
from dataclasses import dataclass

from app.config import DATA_DIR


@dataclass
class MatchResult:
    question_id: int
    question_text: str
    answer: str
    video_path: str
    variation: str
    is_fallback: bool = False


_questions: list[dict] = []
_fallback: dict | None = None


def load_questions():
    global _questions, _fallback
    path = DATA_DIR / "questions.json"
    with open(path) as f:
        all_entries = json.load(f)
    _questions = [q for q in all_entries if not q.get("is_fallback")]
    _fallback = next((q for q in all_entries if q.get("is_fallback")), None)


def get_questions() -> list[dict]:
    if not _questions:
        load_questions()
    return _questions


def get_fallback() -> dict:
    if _fallback is None:
        load_questions()
    return _fallback


def pick_variation(entry: dict) -> MatchResult:
    """Randomly pick a variation (B/C/D) that has both answer and video."""
    available = []
    for var in ("B", "C", "D"):
        if entry["answers"].get(var) and entry["videos"].get(var):
            available.append(var)

    # For fallback, also include E-H
    if entry.get("is_fallback"):
        for var in ("E", "F", "G", "H"):
            if entry["answers"].get(var) and entry["videos"].get(var):
                available.append(var)

    if not available:
        available = ["B"]  # last resort

    var = random.choice(available)
    return MatchResult(
        question_id=entry["id"],
        question_text=entry["question"],
        answer=entry["answers"].get(var, ""),
        video_path=entry["videos"].get(var, ""),
        variation=var,
        is_fallback=entry.get("is_fallback", False),
    )
