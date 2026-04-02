# Hear Paul Jennings — Windows 11 Setup

Windows 11 with an NVIDIA GPU. No internet required after initial setup.

## Prerequisites

- Windows 11 PC with an NVIDIA GPU (8+ GB video memory)
- NVIDIA drivers with CUDA 12+ installed
- Administrator access

Verify GPU access by opening Command Prompt (search "cmd", right-click, Run as administrator):

```
nvidia-smi
```

The output should show your GPU name and CUDA version 12.0 or higher. If this command fails, install the latest NVIDIA drivers from nvidia.com.

## Step 1: Install Python

Download Python 3.12 from [python.org](https://www.python.org/downloads/).

Run the installer. On the first screen, **check "Add python.exe to PATH"**. Without this, Python commands won't be recognized.

Open a new Command Prompt and verify:

```
python --version
```

Expected output: `Python 3.12.x`

## Step 2: Install ffmpeg

```
winget install ffmpeg
```

Close and reopen Command Prompt, then verify:

```
ffmpeg -version
```

## Step 3: Get the project files

Copy the `HearPaulJennings` folder onto the PC. This guide assumes `C:\HearPaulJennings`.

From a USB drive, zip file, or GitHub:

```
cd C:\
git clone https://github.com/Alx-AI/HearPaulJennings.git
```

## Step 4: Place video files

Download the `OneDrive_1_2-27-2026` folder from Google Drive and place it inside the project:

```
C:\HearPaulJennings\
  OneDrive_1_2-27-2026\
    Column B\       (36 .mp4 files)
    Column C\       (36 .mp4 files)
    Column D\       (36 .mp4 files)
    Extra Videos\   (6 .mp4 files)
    layout\         (left_pic.png, right_pic.png, fullmockup.png)
```

Verify file counts:

```
dir "C:\HearPaulJennings\OneDrive_1_2-27-2026\Column B\*.mp4" | find "File(s)"
dir "C:\HearPaulJennings\OneDrive_1_2-27-2026\Column C\*.mp4" | find "File(s)"
dir "C:\HearPaulJennings\OneDrive_1_2-27-2026\Column D\*.mp4" | find "File(s)"
dir "C:\HearPaulJennings\OneDrive_1_2-27-2026\Extra Videos\*.mp4" | find "File(s)"
```

Expected: 36, 36, 36, and 6 files.

## Step 5: Install Python packages

```
cd C:\HearPaulJennings
pip install fastapi uvicorn python-multipart httpx sentence-transformers numpy python-dotenv faster-whisper openpyxl
```

This will take a few minutes.

If your CUDA version is 13 or higher (per the `nvidia-smi` output), also run:

```
pip install nvidia-cublas-cu12
```

## Step 6: Create the config file

```
cd C:\HearPaulJennings
echo STT_BACKEND=whisper > .env
```

## Step 7: Generate embeddings

If the file `data\embeddings.npy` does not already exist:

```
cd C:\HearPaulJennings
python -c "import numpy as np, json; from sentence_transformers import SentenceTransformer; model = SentenceTransformer('all-MiniLM-L6-v2'); f = open('data/questions.json'); questions = [q for q in json.load(f) if not q.get('is_fallback')]; embeddings = model.encode([q['question'] for q in questions], normalize_embeddings=True); np.save('data/embeddings.npy', embeddings); print(f'Saved {len(embeddings)} embeddings')"
```

First run downloads a model (~80 MB). Output should read "Saved 35 embeddings".

## Step 8: Start the server

```
cd C:\HearPaulJennings
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

First run downloads speech recognition models (~250 MB). Wait for:

```
INFO:     Application startup complete.
```

If you see an error about `libcublas` or CUDA libraries, set the library path first:

```
set PATH=%LOCALAPPDATA%\Programs\Python\Python312\Lib\site-packages\nvidia\cublas\lib;%PATH%
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Windows Firewall may prompt to allow Python network access. Click "Allow access".

## Step 9: Open in browser

Open Chrome or Edge:

```
http://localhost:8080
```

The kiosk should display with the building illustration on the left, Paul Jennings in the center, and the ship illustration on the right.

## Verification

1. Click the **?** button (top right) to view the question list
2. Click any question to play the video response
3. Click the **mic** button and speak a question
4. Press **D** to toggle debug output

## Auto-start on boot (optional)

1. Press Windows+R, type `shell:startup`, press Enter
2. Right-click in the folder, select New > Shortcut
3. Location:
   ```
   cmd /k "cd C:\HearPaulJennings && python -m uvicorn app.main:app --host 0.0.0.0 --port 8080"
   ```
4. Name it "HearPaulJennings"
5. Set the browser to open `http://localhost:8080` on startup (Settings > On startup > Open a specific page)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `libcublas` or CUDA library errors | `pip install nvidia-cublas-cu12` and set PATH (see Step 8) |
| `CUDA out of memory` | Close other GPU-bound programs. `nvidia-smi` shows what is running. |
| `ffmpeg is not recognized` | `winget install ffmpeg`, then reopen Command Prompt |
| `python is not recognized` | Reinstall Python with "Add to PATH" checked. Open a new Command Prompt. |
| Videos don't play | Verify folder structure matches Step 4 |
| Mic not working | Allow microphone access in the browser. Must be on `localhost`, not an IP address. |
| `No module named 'faster_whisper'` | `pip install faster-whisper` |
| Server won't start / port in use | Open Task Manager, end any running Python processes, retry |
| Black screen on idle | Confirm `frontend\idle-poster.jpg` exists |
