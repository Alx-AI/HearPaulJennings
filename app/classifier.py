"""Semantic similarity classifier using sentence-transformers."""

import numpy as np
from sentence_transformers import SentenceTransformer

from app.config import DATA_DIR, SIMILARITY_THRESHOLD
from app.questions import get_questions, get_fallback, pick_variation, MatchResult

_model: SentenceTransformer | None = None
_embeddings: np.ndarray | None = None


def load_classifier():
    global _model, _embeddings
    _model = SentenceTransformer("all-MiniLM-L6-v2")
    _embeddings = np.load(DATA_DIR / "embeddings.npy")


def classify(text: str) -> tuple[MatchResult, float]:
    """Classify user text against pre-computed question embeddings.

    Returns (MatchResult, confidence_score).
    """
    if _model is None or _embeddings is None:
        load_classifier()

    query_embedding = _model.encode([text], normalize_embeddings=True)
    similarities = np.dot(_embeddings, query_embedding.T).flatten()
    best_idx = int(np.argmax(similarities))
    confidence = float(similarities[best_idx])

    questions = get_questions()

    if confidence < SIMILARITY_THRESHOLD:
        fallback = get_fallback()
        return pick_variation(fallback), confidence

    matched = questions[best_idx]
    return pick_variation(matched), confidence
