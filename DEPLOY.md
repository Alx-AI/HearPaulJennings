# Hear Paul Jennings — Deployment Guide

Setup for a Linux machine with an NVIDIA GPU. No internet required after initial setup.

## Prerequisites

- Linux with NVIDIA GPU (8+ GB VRAM)
- Python 3.12+
- ffmpeg installed (`apt install ffmpeg` or bundled)
- NVIDIA drivers with CUDA 12+ (`nvidia-smi` to verify)

## Step 1: Get the Code

```bash
cd /root
git clone https://github.com/Alx-AI/HearPaulJennings.git
cd HearPaulJennings
```

Or copy from USB/download and extract to `/root/HearPaulJennings`.

## Step 2: Place Video Files

Download the `OneDrive_1_2-27-2026` folder from Google Drive and place it inside the project:

```
HearPaulJennings/
  OneDrive_1_2-27-2026/
    Column B/       (36 .mp4 files)
    Column C/       (36 .mp4 files)
    Column D/       (36 .mp4 files)
    Extra Videos/   (6 .mp4 files)
    layout/         (left_pic.png, right_pic.png, fullmockup.png)
```

Verify counts:
```bash
ls "OneDrive_1_2-27-2026/Column B/" | wc -l   # expect 36
ls "OneDrive_1_2-27-2026/Column C/" | wc -l   # expect 36
ls "OneDrive_1_2-27-2026/Column D/" | wc -l   # expect 36
ls "OneDrive_1_2-27-2026/Extra Videos/" | wc -l # expect 6
ls "OneDrive_1_2-27-2026/layout/" | wc -l      # expect 3
```

## Step 3: Install Python Dependencies

```bash
cd /root/HearPaulJennings
pip install fastapi uvicorn python-multipart httpx sentence-transformers numpy python-dotenv faster-whisper openpyxl

# If on CUDA 13+, also install CUDA 12 cublas (needed by faster-whisper/ctranslate2)
pip install nvidia-cublas-cu12
```

## Step 4: Configure

```bash
cat > .env << 'EOF'
STT_BACKEND=whisper
EOF
```

This uses faster-whisper (GPU-accelerated, lightweight). Models download on first run (~250MB total).

## Step 5: Generate Embeddings (if missing)

```bash
test -f data/embeddings.npy || python3 -c "
import numpy as np, json
from sentence_transformers import SentenceTransformer
model = SentenceTransformer('all-MiniLM-L6-v2')
with open('data/questions.json') as f:
    questions = [q for q in json.load(f) if not q.get('is_fallback')]
embeddings = model.encode([q['question'] for q in questions], normalize_embeddings=True)
np.save('data/embeddings.npy', embeddings)
print(f'Saved {len(embeddings)} embeddings')
"
```

## Step 6: Verify Setup

```bash
python3 << 'VERIFY'
import json, os, subprocess

# Check videos
with open('data/questions.json') as f:
    data = json.load(f)
missing = []
for q in data:
    for var, path in q['videos'].items():
        full = f'OneDrive_1_2-27-2026/{path}'
        if not os.path.exists(full):
            missing.append(full)
if missing:
    print(f'FAIL: Missing {len(missing)} videos:')
    for m in missing[:5]: print(f'  {m}')
else:
    print('OK: All videos present')

# Check embeddings
import numpy as np
e = np.load('data/embeddings.npy')
print(f'OK: {len(e)} embeddings loaded')

# Check layout images
for img in ['left_pic.png', 'right_pic.png']:
    path = f'OneDrive_1_2-27-2026/layout/{img}'
    status = 'OK' if os.path.exists(path) else 'FAIL'
    print(f'{status}: {path}')

# Check ffmpeg
r = subprocess.run(['ffmpeg', '-version'], capture_output=True)
status = 'OK' if r.returncode == 0 else 'FAIL'
print(f'{status}: ffmpeg')
VERIFY
```

All lines should say `OK`.

## Step 7: Start the Server

```bash
cd /root/HearPaulJennings

# Kill anything on port 8080
lsof -ti :8080 | xargs kill -9 2>/dev/null || true

# Set CUDA library path (needed for faster-whisper on CUDA 13+ machines)
export LD_LIBRARY_PATH=/usr/local/lib/python3.12/dist-packages/nvidia/cublas/lib:$LD_LIBRARY_PATH

# Start (first run downloads ML models, takes 1-2 min)
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Wait for: `INFO: Application startup complete.`

To run in the background instead:
```bash
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 > /tmp/uvicorn.log 2>&1 &
tail -f /tmp/uvicorn.log
```

## Step 8: Open in Browser

- **Local machine**: Open `http://localhost:8080`
- **Remote (SSH tunnel)**: From your local machine run:
  ```bash
  ssh -p PORT root@HOST -L 8080:localhost:8080
  ```
  Then open `http://localhost:8080` locally.

## Quick Test

1. You should see: left building illustration | Paul Jennings portrait | right ship illustration
2. Click the **?** button (top right) to see the question list
3. Click any question to hear Paul's answer
4. Click the **mic** button to ask by voice
5. Press **D** to toggle debug info

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `libcublas.so.12 not found` | `pip install nvidia-cublas-cu12` and set `LD_LIBRARY_PATH` (see Step 7) |
| `CUDA out of memory` | Close other GPU processes: `nvidia-smi` to check |
| `ffmpeg: command not found` | `apt install ffmpeg` |
| Videos don't play | Check folder structure matches Step 2 |
| Mic not working | Must use `localhost` or HTTPS. Grant browser permission when prompted. |
| `No module named 'faster_whisper'` | `pip install faster-whisper` |
| Black screen on idle | Check `frontend/idle-poster.jpg` exists |
| Server won't start / port in use | `lsof -ti :8080 \| xargs kill -9` then restart |
