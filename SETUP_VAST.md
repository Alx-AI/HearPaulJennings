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

### Option A: Download with gdown

```bash
pip install gdown

# Download the entire folder
gdown --folder "https://drive.google.com/drive/folders/1vEoHtODolBr4oZ8Ctcz02nCnU5CAVqof" -O /root/HearPaulJennings/OneDrive_1_2-27-2026
```

**Note**: gdown may only download a partial set of files if Google rate-limits. Check the counts below and use Option B for any missing files.

### Option B: Upload from your local machine (most reliable)

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

A GPU instance is required because the NVIDIA Parakeet STT model runs locally on the GPU (no external API calls).

```bash
cd /root/HearPaulJennings

pip3 install fastapi uvicorn python-multipart httpx sentence-transformers numpy python-dotenv 'nemo_toolkit[asr]' soundfile
```

This installs:
- **FastAPI + uvicorn**: Web server (API + backend)
- **sentence-transformers**: Question classifier (runs on CPU)
- **nemo_toolkit[asr]**: NVIDIA Parakeet TDT 0.6B v2 for local STT (runs on GPU, ~2-3 GB VRAM)
- **soundfile**: Audio format handling

The Parakeet model (~600 MB) downloads automatically on first startup and may take a minute or two.

## Step 5: Configure Environment

```bash
cd /root/HearPaulJennings

cat > .env << 'EOF'
STT_BACKEND=local
EOF
```

`STT_BACKEND=local` uses NVIDIA Parakeet for local GPU-based speech-to-text. No API keys are needed.

## Step 6: Generate Embeddings

If `data/embeddings.npy` doesn't exist (it's gitignored), regenerate it:

```bash
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

## Step 7: Set Up Nginx (Video Serving)

Nginx serves static files (videos, frontend) much faster than Python. The API still runs on uvicorn.

```bash
apt-get update -qq && apt-get install -y -qq nginx

cat > /etc/nginx/sites-available/default << 'NGINX'
server {
    listen 9090;
    client_max_body_size 20M;

    # Video files — served directly by nginx with sendfile for speed
    location /videos/ {
        alias /root/HearPaulJennings/OneDrive_1_2-27-2026/;
        sendfile on;
        tcp_nopush on;
        output_buffers 1 128k;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }

    # Static frontend files
    location / {
        root /root/HearPaulJennings/frontend;
        try_files $uri $uri/ /index.html;
        expires 5m;
        gzip on;
        gzip_types text/css application/javascript;
    }

    # API calls → uvicorn
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINX

# Fix permissions so nginx can read the files
chmod -R o+r /root/HearPaulJennings/OneDrive_1_2-27-2026/
chmod o+x /root /root/HearPaulJennings /root/HearPaulJennings/OneDrive_1_2-27-2026 \
  /root/HearPaulJennings/OneDrive_1_2-27-2026/Column\ B \
  /root/HearPaulJennings/OneDrive_1_2-27-2026/Column\ C \
  /root/HearPaulJennings/OneDrive_1_2-27-2026/Column\ D \
  "/root/HearPaulJennings/OneDrive_1_2-27-2026/Extra Videos" \
  /root/HearPaulJennings/frontend

nginx -t && nginx
echo "Nginx running on port 9090"
```

## Step 8: Start the API Server

```bash
cd /root/HearPaulJennings

# Kill Jupyter if it's using port 8080
lsof -ti :8080 | xargs kill -9 2>/dev/null

# Start uvicorn (API only — nginx handles static files)
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 > /tmp/uvicorn.log 2>&1 &

# Watch startup logs (first run downloads the Parakeet model, takes a few minutes)
tail -f /tmp/uvicorn.log
```

Wait until you see:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8080
```

## Step 9: Expose with HTTPS Tunnel

The browser requires HTTPS for microphone access. There are two approaches depending on whether outbound connections work from your Vast instance.

### Option A: Cloudflared on the Vast instance (simplest)

Many Vast instances block outbound DNS (UDP port 53). If cloudflared fails with DNS errors, first set up a DNS-over-HTTPS proxy:

```bash
# Start cloudflared as a DNS proxy (resolves via HTTPS, bypassing blocked UDP DNS)
nohup cloudflared proxy-dns --port 53 > /tmp/cf-dns.log 2>&1 &
echo "nameserver 127.0.0.1" > /etc/resolv.conf
sleep 5

# Warm the DNS cache
dig +short api.trycloudflare.com > /dev/null 2>&1
dig +short _v2-origintunneld._tcp.argotunnel.com SRV > /dev/null 2>&1
sleep 2

# Now start the tunnel (pointing to nginx on port 9090)
nohup cloudflared tunnel --url http://localhost:9090 > /tmp/cloudflared.log 2>&1 &
sleep 15
grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cloudflared.log | grep -v api | head -1
```

If this prints a URL, you're done. If not, check the log:
```bash
tail -10 /tmp/cloudflared.log
```

If it says "server misbehaving" or "context deadline exceeded", the instance's network is too restricted for direct tunneling. Use Option B.

### Option B: Tunnel via your local machine (most reliable)

This routes traffic through your local machine's network, which has unrestricted internet access. Your machine must stay on while others are accessing the kiosk.

```bash
# From your LOCAL machine:

# 1. Open SSH tunnel from your machine to the Vast nginx server
ssh -i ~/.ssh/id_ed25519 -p <PORT> root@<HOST> -L 9090:localhost:9090 -N -f

# 2. Verify it works
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:9090/

# 3. Install cloudflared locally if you don't have it
#    macOS: brew install cloudflared
#    Linux: See https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/

# 4. Start the tunnel
cloudflared tunnel --url http://localhost:9090

# The URL will be printed to the console, e.g.:
# https://something-something.trycloudflare.com
```

Share this URL with anyone — it's publicly accessible over HTTPS.

**Note**: Free cloudflared tunnel URLs are temporary. If the URL stops working, restart cloudflared.

## Step 10: Test It

1. Open the tunnel URL in Chrome/Firefox
2. You should see Paul Jennings' portrait on the left with a question list on the right
3. **Click any question** in the sidebar to hear Paul's answer
4. Or click the **mic button** and ask a question by voice
5. Try asking the same question again — you should get a different video variation
6. Press **D** to toggle the debug status bar (hidden by default)

## Architecture

```
Browser → Cloudflare Tunnel (HTTPS) → Nginx (:9090)
                                        ├── /videos/*  → static files (sendfile)
                                        ├── /*         → frontend HTML/CSS/JS
                                        └── /api/*     → uvicorn (:8080) → FastAPI
                                                          ├── /api/ask       (audio → STT → classify → response)
                                                          ├── /api/classify  (text → classify → response)
                                                          └── /api/questions (list all questions)
```

## Troubleshooting

### Black screen / videos won't load

- Check nginx is running: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:9090/`
- Check video serving: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:9090/videos/Column%20B/B2.mp4`
- If you get 403, re-run the `chmod` commands from Step 7
- If you get 404, check the video folder structure matches `data/questions.json`

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

- Must be served over HTTPS (use the tunnel)
- Grant microphone permission when the browser prompts
- Check browser console for errors
- Note: Mic is optional — visitors can tap questions directly from the sidebar

### Server won't start / port in use

```bash
# Kill Jupyter or previous server on port 8080
lsof -ti :8080 | xargs kill -9

# Restart uvicorn
cd /root/HearPaulJennings
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 > /tmp/uvicorn.log 2>&1 &
```

### Cloudflared DNS errors on Vast instance

Many Vast instances block outbound UDP port 53 (DNS). The fix is to use cloudflared's built-in DNS-over-HTTPS proxy:

```bash
# Kill existing DNS proxy and cloudflared
pkill cloudflared

# Start DNS proxy (resolves via HTTPS on port 443, not UDP 53)
nohup cloudflared proxy-dns --port 53 > /tmp/cf-dns.log 2>&1 &
echo "nameserver 127.0.0.1" > /etc/resolv.conf

# Wait for DNS to be ready, then warm cache
sleep 5
dig +short google.com > /dev/null 2>&1
dig +short api.trycloudflare.com > /dev/null 2>&1
sleep 2

# Now start the tunnel
nohup cloudflared tunnel --url http://localhost:9090 > /tmp/cloudflared.log 2>&1 &
```

If this still fails, use the local machine tunnel approach (Step 9, Option B).

### SSH connection keeps dropping

Vast.ai's proxy SSH (`ssh<N>.vast.ai`) can be flaky with long transfers. Tips:
- Add `-o ServerAliveInterval=15` to your SSH command
- Transfer files one column at a time (not in parallel)
- Use `tar | ssh` pipes instead of `scp` or `rsync`

## One-Command Deploy Script

For convenience, here's a single script that does Steps 4-9 after you've cloned the repo and placed the videos:

```bash
#!/bin/bash
set -e
cd /root/HearPaulJennings

# Install deps
pip3 install fastapi uvicorn python-multipart httpx sentence-transformers numpy python-dotenv 'nemo_toolkit[asr]' soundfile

# Configure (local Parakeet STT — no API keys needed)
echo "STT_BACKEND=local" > .env

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

# Set up nginx
apt-get update -qq && apt-get install -y -qq nginx
cat > /etc/nginx/sites-available/default << 'NGINX'
server {
    listen 9090;
    client_max_body_size 20M;
    location /videos/ {
        alias /root/HearPaulJennings/OneDrive_1_2-27-2026/;
        sendfile on;
        tcp_nopush on;
        output_buffers 1 128k;
        expires 1h;
        add_header Cache-Control "public, immutable";
    }
    location / {
        root /root/HearPaulJennings/frontend;
        try_files $uri $uri/ /index.html;
        expires 5m;
        gzip on;
        gzip_types text/css application/javascript;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINX
chmod -R o+r /root/HearPaulJennings/OneDrive_1_2-27-2026/
chmod o+x /root /root/HearPaulJennings /root/HearPaulJennings/OneDrive_1_2-27-2026 \
  /root/HearPaulJennings/OneDrive_1_2-27-2026/Column\ B \
  /root/HearPaulJennings/OneDrive_1_2-27-2026/Column\ C \
  /root/HearPaulJennings/OneDrive_1_2-27-2026/Column\ D \
  "/root/HearPaulJennings/OneDrive_1_2-27-2026/Extra Videos" \
  /root/HearPaulJennings/frontend
nginx -t && nginx
echo "Nginx running on port 9090"

# Kill Jupyter on port 8080 if present
lsof -ti :8080 | xargs kill -9 2>/dev/null || true

# Start API server
pkill -f uvicorn 2>/dev/null || true
nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 > /tmp/uvicorn.log 2>&1 &
echo "Waiting for server to start (loading Parakeet model)..."
until grep -q "Application startup complete" /tmp/uvicorn.log 2>/dev/null; do sleep 2; done
echo "Server running on port 8080"

# Set up DNS proxy (many Vast instances block UDP DNS)
nohup cloudflared proxy-dns --port 53 > /tmp/cf-dns.log 2>&1 &
echo "nameserver 127.0.0.1" > /etc/resolv.conf
sleep 5
dig +short api.trycloudflare.com > /dev/null 2>&1
sleep 2

# Start tunnel
nohup cloudflared tunnel --url http://localhost:9090 > /tmp/cloudflared.log 2>&1 &
sleep 15
URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cloudflared.log | grep -v api | head -1)

if [ -n "$URL" ]; then
  echo ""
  echo "=== Kiosk is live at: $URL ==="
else
  echo ""
  echo "Cloudflared tunnel failed (common on Vast instances with restricted networking)."
  echo "Use the local tunnel method instead — from your LOCAL machine run:"
  echo ""
  echo "  ssh -i ~/.ssh/id_ed25519 -p <PORT> root@<HOST> -L 9090:localhost:9090 -N -f"
  echo "  cloudflared tunnel --url http://localhost:9090"
  echo ""
  echo "The kiosk is running on the Vast instance at localhost:9090"
fi
```
