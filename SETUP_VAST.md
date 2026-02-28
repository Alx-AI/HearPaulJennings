# Deploying Hear Paul Jennings on Vast.ai (RTX 5090)

Complete step-by-step guide to deploy the kiosk on a Vast.ai GPU instance with local speech-to-text.

## Prerequisites

- A [Vast.ai](https://vast.ai) account with billing set up
- SSH key added to your Vast.ai account (Account → SSH Keys)
- The video files (see Step 3)

## Step 1: Rent a GPU Instance

1. Go to [Vast.ai Search](https://vast.ai/search)
2. Filter for:
   - **GPU**: RTX 5090 (or any NVIDIA GPU with 8+ GB VRAM)
   - **Image**: `vastai/base-image_cuda-13.0.2-auto/jupyter`
   - **Disk**: 32 GB minimum
3. Select an instance and click **Rent**
4. Note the SSH connection info from the instance page (you'll see two options):
   - Direct: `ssh -p <PORT> root@<IP>`
   - Proxy: `ssh -p <PORT> root@ssh<N>.vast.ai`

## Step 2: Connect and Clone the Repo

```bash
# Connect to your instance (use whichever SSH method works)
ssh -i ~/.ssh/id_ed25519 -p <PORT> root@ssh<N>.vast.ai

# Clone the repository
cd /root
git clone https://github.com/Alx-AI/HearPaulJennings.git
cd HearPaulJennings
```

## Step 3: Download Video Files

The video files (~285 MB) are hosted on Google Drive and are not included in the git repo.

**Google Drive link**: https://drive.google.com/drive/folders/1vEoHtODolBr4oZ8Ctcz02nCnU5CAVqof?usp=sharing

### Option A: Download with gdown (recommended)

```bash
pip install gdown

# Download the entire folder
gdown --folder "https://drive.google.com/drive/folders/1vEoHtODolBr4oZ8Ctcz02nCnU5CAVqof" -O /root/HearPaulJennings/OneDrive_1_2-27-2026
```

### Option B: Upload from your local machine

If gdown doesn't work (Google sometimes blocks automated downloads), upload from your local machine:

```bash
# From your LOCAL machine (not the Vast instance):
cd /path/to/HearPaulJennings/OneDrive_1_2-27-2026

# Upload each column (one at a time to avoid SSH drops)
# Replace <PORT> and <HOST> with your Vast SSH info

COPYFILE_DISABLE=1 tar czf - "Column B/" | ssh -i ~/.ssh/id_ed25519 -p <PORT> -o ServerAliveInterval=15 root@<HOST> \
  "mkdir -p /root/HearPaulJennings/OneDrive_1_2-27-2026 && cd /root/HearPaulJennings/OneDrive_1_2-27-2026 && tar xzf -"

COPYFILE_DISABLE=1 tar czf - "Column C/" | ssh -i ~/.ssh/id_ed25519 -p <PORT> -o ServerAliveInterval=15 root@<HOST> \
  "cd /root/HearPaulJennings/OneDrive_1_2-27-2026 && tar xzf -"

COPYFILE_DISABLE=1 tar czf - "Column D/" | ssh -i ~/.ssh/id_ed25519 -p <PORT> -o ServerAliveInterval=15 root@<HOST> \
  "cd /root/HearPaulJennings/OneDrive_1_2-27-2026 && tar xzf -"

COPYFILE_DISABLE=1 tar czf - "Extra Videos/" | ssh -i ~/.ssh/id_ed25519 -p <PORT> -o ServerAliveInterval=15 root@<HOST> \
  "cd /root/HearPaulJennings/OneDrive_1_2-27-2026 && tar xzf -"
```

### Verify videos

Back on the Vast instance:

```bash
ls OneDrive_1_2-27-2026/Column\ B/ | wc -l  # Should be 36
ls OneDrive_1_2-27-2026/Column\ C/ | wc -l  # Should be 36
ls OneDrive_1_2-27-2026/Column\ D/ | wc -l  # Should be 36
ls OneDrive_1_2-27-2026/Extra\ Videos/ | wc -l  # Should be 6
```

## Step 4: Install Python Dependencies

```bash
cd /root/HearPaulJennings

pip3 install fastapi uvicorn python-multipart httpx sentence-transformers numpy python-dotenv 'nemo_toolkit[asr]' soundfile
```

This installs:
- **FastAPI + uvicorn**: Web server
- **sentence-transformers**: Question classifier (runs on CPU)
- **nemo_toolkit[asr]**: NVIDIA Parakeet STT model (runs on GPU)
- **soundfile**: Audio format handling

The Parakeet model (~600 MB) will be downloaded automatically on first startup.

## Step 5: Configure Environment

```bash
cd /root/HearPaulJennings

cat > .env << 'EOF'
GROQ_API_KEY=
STT_BACKEND=local
EOF
```

`STT_BACKEND=local` tells the app to use Parakeet (GPU) instead of the Groq API.

## Step 6: Generate Embeddings

If `data/embeddings.npy` doesn't exist (it's gitignored), regenerate it:

```bash
pip3 install openpyxl  # Only needed for this step

# If you have the source spreadsheet:
python3 scripts/extract_questions.py

# If you don't have the spreadsheet, the embeddings can be generated from questions.json:
python3 -c "
import numpy as np
from sentence_transformers import SentenceTransformer
import json

model = SentenceTransformer('all-MiniLM-L6-v2')
with open('data/questions.json') as f:
    questions = [q for q in json.load(f) if not q.get('is_fallback')]
embeddings = model.encode([q['question'] for q in questions], normalize_embeddings=True)
np.save('data/embeddings.npy', embeddings)
print(f'Saved {len(embeddings)} embeddings')
"
```

## Step 7: Start the Server

```bash
cd /root/HearPaulJennings

# Start in background
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 > /tmp/uvicorn.log 2>&1 &

# Watch startup logs (first run downloads the Parakeet model, takes a few minutes)
tail -f /tmp/uvicorn.log
```

Wait until you see:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8080
```

## Step 8: Expose with Cloudflared (HTTPS)

The browser requires HTTPS for microphone access. Vast.ai's external ports don't support HTTPS natively, so we use Cloudflare Tunnel (cloudflared is pre-installed on Vast base images).

```bash
# Start tunnel in background
nohup cloudflared tunnel --url http://localhost:8080 > /tmp/cloudflared.log 2>&1 &

# Wait a few seconds, then get your public URL
sleep 5
grep -aoP 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1
```

This gives you a public HTTPS URL like `https://something-something.trycloudflare.com`. Open it in your browser to use the kiosk.

**Note**: Free cloudflared tunnel URLs are temporary and expire. If the URL stops working, restart cloudflared:

```bash
pkill cloudflared
nohup cloudflared tunnel --url http://localhost:8080 > /tmp/cloudflared.log 2>&1 &
sleep 5
grep -aoP 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1
```

## Step 9: Test It

1. Open the cloudflared URL in Chrome/Firefox
2. You should see the intro video play, then a still image of Paul Jennings
3. Click **"Ask a Question"** and grant microphone access
4. Ask something like *"What was your family like?"*
5. The system should transcribe, match, and play the corresponding video
6. Try asking the same question again — you should get a different video variation

## Troubleshooting

### "CUDA graphs" errors in logs

If you see errors about CUDA graphs or `keep_graph_ INTERNAL ASSERT FAILED`, the transcriber's greedy decoding workaround should handle this. Verify `app/transcriber.py` has:

```python
decoding_cfg = OmegaConf.create({
    "strategy": "greedy",      # NOT "greedy_batch"
    "model_type": "tdt",
    "durations": [0, 1, 2, 3, 4],
    "greedy": {"max_symbols": 10},
})
self.model.change_decoding_strategy(decoding_cfg)
```

### Video 404 errors

Check that the `OneDrive_1_2-27-2026/` folder structure matches what's in `data/questions.json`. The video paths should be like `Column B/B2.mp4`, `Column C/C5 (1).mp4`, etc.

```bash
# Verify all referenced videos exist
python3 -c "
import json, os
with open('data/questions.json') as f:
    data = json.load(f)
missing = []
for q in data:
    for var, path in q['videos'].items():
        full = f'OneDrive_1_2-27-2026/{path}'
        if not os.path.exists(full):
            missing.append(full)
if missing:
    print(f'Missing {len(missing)} videos:')
    for m in missing: print(f'  {m}')
else:
    print('All videos present')
"
```

### Microphone not working

- Must be served over HTTPS (use cloudflared)
- Grant microphone permission when the browser prompts
- Check browser console for errors

### Server won't start / port in use

```bash
# Find what's using port 8080
lsof -i :8080

# Kill previous server instances
pkill -f uvicorn

# Restart
cd /root/HearPaulJennings
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 > /tmp/uvicorn.log 2>&1 &
```

### SSH connection keeps dropping

Vast.ai's proxy SSH (`ssh<N>.vast.ai`) can be flaky with long transfers. Tips:
- Add `-o ServerAliveInterval=15` to your SSH command
- Transfer files one column at a time (not in parallel)
- Use `tar | ssh` pipes instead of `scp` or `rsync`

## One-Command Deploy Script

For convenience, here's a single script that does Steps 4-8 after you've cloned the repo and placed the videos:

```bash
#!/bin/bash
cd /root/HearPaulJennings

# Install deps
pip3 install fastapi uvicorn python-multipart httpx sentence-transformers numpy python-dotenv 'nemo_toolkit[asr]' soundfile

# Configure
echo -e "GROQ_API_KEY=\nSTT_BACKEND=local" > .env

# Generate embeddings if needed
if [ ! -f data/embeddings.npy ]; then
  python3 -c "
import numpy as np
from sentence_transformers import SentenceTransformer
import json
model = SentenceTransformer('all-MiniLM-L6-v2')
with open('data/questions.json') as f:
    questions = [q for q in json.load(f) if not q.get('is_fallback')]
embeddings = model.encode([q['question'] for q in questions], normalize_embeddings=True)
np.save('data/embeddings.npy', embeddings)
print(f'Saved {len(embeddings)} embeddings')
"
fi

# Start server
pkill -f uvicorn 2>/dev/null
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 > /tmp/uvicorn.log 2>&1 &
echo "Waiting for server to start (loading Parakeet model)..."
until grep -q "Application startup complete" /tmp/uvicorn.log 2>/dev/null; do sleep 2; done
echo "Server running on port 8080"

# Start tunnel
pkill cloudflared 2>/dev/null
nohup cloudflared tunnel --url http://localhost:8080 > /tmp/cloudflared.log 2>&1 &
sleep 5
URL=$(grep -aoP 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log | head -1)
echo ""
echo "=== Kiosk is live at: $URL ==="
```
