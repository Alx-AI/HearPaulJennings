# Hear Paul Jennings

An interactive museum kiosk where visitors speak questions into a microphone and receive video responses from a digitally recreated Paul Jennings — an enslaved man who served as valet to President James Madison in the White House. Paul Jennings later wrote the first White House memoir, *A Colored Man's Reminiscences of James Madison* (1865).

## How It Works

1. Visitor presses **"Ask a Question"** and speaks into the microphone
2. Speech is transcribed locally using NVIDIA Parakeet TDT 0.6B v2
3. The question is matched against 35 pre-defined topics using semantic similarity
4. A corresponding video response plays (3 variations per question for variety)
5. If the question doesn't match anything, a fallback response plays followed by a "walk-off" dismissal

## Architecture

```
Browser (mic) → FastAPI Backend → Parakeet STT (local GPU)
                                       ↓
                           sentence-transformers classifier
                              (all-MiniLM-L6-v2, CPU)
                                       ↓
                           Return matched video path
                                       ↓
                          Browser plays video response
```

- **STT**: NVIDIA Parakeet TDT 0.6B v2 via NeMo (~2-3 GB VRAM, <500ms)
- **Classifier**: all-MiniLM-L6-v2 (22MB, runs on CPU in <30ms)
- **Frontend**: Vanilla HTML/JS/CSS with MediaRecorder API
- **Backend**: FastAPI serving the API + static files
- **Total VRAM**: ~3 GB of 32 GB on RTX 5090

## Project Structure

```
HearPaulJennings/
├── app/
│   ├── main.py              # FastAPI app, routes, static file serving
│   ├── transcriber.py       # STT — NVIDIA Parakeet (local GPU)
│   ├── classifier.py        # Semantic similarity matching
│   ├── questions.py         # Question/answer/video data loader
│   └── config.py            # Settings (env vars, paths, thresholds)
├── frontend/
│   ├── index.html           # Single page — video + mic button + captions
│   ├── style.css            # Period-inspired dark/gold styling
│   ├── app.js               # Mic capture, API calls, video state machine
│   └── idle-poster.jpg      # Still frame shown between interactions
├── data/
│   ├── questions.json       # 35 questions + fallback with answers & video paths
│   └── embeddings.npy       # Pre-computed question embeddings (generated)
├── scripts/
│   └── extract_questions.py # One-time: parse spreadsheet → questions.json
├── OneDrive_1_2-27-2026/    # Video files (not in git — see setup guide)
│   ├── Column B/            # 36 video responses (variation B)
│   ├── Column C/            # 36 video responses (variation C)
│   ├── Column D/            # 36 video responses (variation D)
│   └── Extra Videos/        # Intro, walk-off, extra fallback responses
├── .env                     # STT_BACKEND=local (not in git)
├── pyproject.toml           # Python dependencies
└── SETUP_VAST.md            # Step-by-step deployment guide
```

## Quick Start

STT requires an NVIDIA GPU with CUDA (Parakeet runs locally on the GPU). See **[SETUP_VAST.md](SETUP_VAST.md)** for deploying on a Vast.ai GPU instance.

```bash
git clone https://github.com/Alx-AI/HearPaulJennings.git
cd HearPaulJennings

# Install dependencies (requires CUDA-capable GPU)
pip install fastapi uvicorn python-multipart httpx sentence-transformers numpy python-dotenv 'nemo_toolkit[asr]' soundfile

# Download videos (see SETUP_VAST.md for the Google Drive link)
# Place the OneDrive_1_2-27-2026/ folder in the project root

# Configure environment
echo 'STT_BACKEND=local' > .env

# Generate embeddings (first time only)
python scripts/extract_questions.py

# Start server (Parakeet model downloads on first run, ~600 MB)
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Open http://localhost:8080 in your browser.

## Production Deployment (GPU on Vast.ai)

See **[SETUP_VAST.md](SETUP_VAST.md)** for complete step-by-step instructions to deploy on a Vast.ai GPU instance.

## Video Content

There are 35 questions covering Paul Jennings' life:

- Family and personal life
- Life as an enslaved person in the White House
- The British burning of the White House in 1814
- Serving President James Madison and Dolley Madison
- His path to freedom and later life
- His memoir and legacy

Each question has 3 video variations (columns B, C, D) that are randomly selected to keep repeat interactions fresh. Fallback responses (row 37) have 7 variations (B through H).

## Technical Notes

- **CUDA graphs workaround**: Parakeet's default `greedy_batch` decoding uses CUDA graphs which are broken on CUDA 13. The transcriber switches to `greedy` decoding strategy via `model.change_decoding_strategy()`.
- **Similarity threshold**: Set to 0.45 (configurable in `config.py`). Questions scoring below this trigger the fallback response.
- **Autoplay policy**: Browsers block autoplay with audio. The frontend handles this by showing a "Touch to Begin" overlay if autoplay fails.
- **Video state machine**: `idle → intro → idle → recording → processing → playing → idle` (with `walkoff` state only for fallback responses).
