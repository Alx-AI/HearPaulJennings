"""FastAPI application — routes, static files, and startup."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import VIDEO_DIR, FRONTEND_DIR
from app.classifier import load_classifier, classify
from app.questions import load_questions
from app.transcriber import get_transcriber


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_questions()
    load_classifier()
    yield


app = FastAPI(title="Hear Paul Jennings", lifespan=lifespan)

transcriber = get_transcriber()


@app.post("/api/ask")
async def ask(audio: UploadFile = File(...)):
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    content_type = audio.content_type or "audio/webm"
    text = await transcriber.transcribe(audio_bytes, content_type)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not transcribe audio")

    result, confidence = classify(text)

    return JSONResponse({
        "transcription": text,
        "question_id": result.question_id,
        "matched_question": result.question_text,
        "answer": result.answer,
        "video_url": f"/videos/{result.video_path}" if result.video_path else None,
        "variation": result.variation,
        "confidence": round(confidence, 3),
        "is_fallback": result.is_fallback,
    })


@app.post("/api/classify")
async def classify_text(body: dict):
    """Debug endpoint: classify text directly without audio."""
    text = body.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")
    result, confidence = classify(text)
    return JSONResponse({
        "transcription": text,
        "question_id": result.question_id,
        "matched_question": result.question_text,
        "answer": result.answer,
        "video_url": f"/videos/{result.video_path}" if result.video_path else None,
        "variation": result.variation,
        "confidence": round(confidence, 3),
        "is_fallback": result.is_fallback,
    })


# Static file mounts (order matters — more specific first)
app.mount("/videos", StaticFiles(directory=str(VIDEO_DIR)), name="videos")
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
