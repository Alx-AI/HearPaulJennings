# Hear Paul Jennings

Interactive kiosk for the U.S. Court of Appeals. Visitors ask questions by voice or touch and receive pre-recorded video responses from a digital portrayal of Paul Jennings, an enslaved man who served as valet to President James Madison and authored the first White House memoir.

## How It Works

1. Visitor taps a question or presses the microphone button and speaks.
2. Speech is transcribed on-device using a local ML model (no cloud services).
3. A classifier matches the question to one of 35 pre-defined topics.
4. The kiosk plays the corresponding video response. Each topic has three variations selected at random.
5. Unrecognized questions receive a fallback response.

## Architecture

```
Browser (mic / touch input)
        |
        v
  FastAPI backend (Python)
        |
        +---> Speech-to-text (faster-whisper, local GPU)
        |
        +---> Question classifier (sentence-transformers, CPU)
        |
        v
  Return matched video path
        |
        v
  Browser plays .mp4 response
```

| Component  | Detail                                      |
|------------|---------------------------------------------|
| STT        | faster-whisper on GPU (~250 MB model)        |
| Classifier | all-MiniLM-L6-v2 (22 MB, CPU, <30 ms)       |
| Frontend   | Static HTML/JS/CSS, MediaRecorder API        |
| Backend    | FastAPI + Uvicorn                            |
| GPU        | Any NVIDIA card with 4+ GB VRAM              |

## Setup

- **Linux**: See [DEPLOY.md](DEPLOY.md)
- **Windows 11**: See [DEPLOY_WINDOWS.md](DEPLOY_WINDOWS.md)

## File Structure

```
HearPaulJennings/
  app/
    main.py            # FastAPI routes and static file serving
    transcriber.py     # Speech-to-text (local GPU)
    classifier.py      # Semantic similarity matching
    questions.py       # Question/answer/video data loader
    config.py          # Environment variables, paths, thresholds
    profanity.py       # Content filter
  frontend/
    index.html         # Single-page interface
    style.css          # Display styling
    app.js             # Mic capture, API calls, video playback
  data/
    questions.json     # 35 questions with answers and video paths
    embeddings.npy     # Pre-computed question embeddings
  scripts/
    extract_questions.py  # Parse source spreadsheet into questions.json
  OneDrive_1_2-27-2026/  # Video files (not in version control)
    Column B/          # 36 video responses (variation B)
    Column C/          # 36 video responses (variation C)
    Column D/          # 36 video responses (variation D)
    Extra Videos/      # Intro, walk-off, fallback clips
    layout/            # Side-panel illustrations
  DEPLOY.md            # Linux deployment guide
  pyproject.toml       # Python dependencies
  .env                 # Runtime configuration (not in version control)
```

## License

See [LICENSE](LICENSE).
