import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
VIDEO_DIR = BASE_DIR / "OneDrive_1_2-27-2026"
FRONTEND_DIR = BASE_DIR / "frontend"

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
STT_BACKEND = os.getenv("STT_BACKEND", "groq")

SIMILARITY_THRESHOLD = 0.45
