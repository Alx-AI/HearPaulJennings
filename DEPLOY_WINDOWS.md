# Hear Paul Jennings — Windows 11 Deployment Guide

Setup for a Windows 11 machine with an NVIDIA GPU. No internet required after initial setup.

## What you need

- Windows 11 PC with an NVIDIA GPU (8+ GB video memory)
- NVIDIA drivers with CUDA 12+ already installed
- Admin access to install software

Open a Command Prompt (search "cmd" in the Start menu, right-click, Run as administrator) and type:

```
nvidia-smi
```

You should see a table showing your GPU name, driver version, and CUDA version. If CUDA Version shows 12.0 or higher, you're good. If this command fails, install the latest NVIDIA drivers from nvidia.com first.

## Step 1: Install Python

Download Python 3.12 from [python.org](https://www.python.org/downloads/).

Run the installer. On the very first screen, **check the box that says "Add python.exe to PATH"**. This is easy to miss and things will break without it.

Click "Install Now" and let it finish.

Verify it worked. Open a new Command Prompt and type:

```
python --version
```

You should see `Python 3.12.x`.

## Step 2: Install ffmpeg

1. Go to https://www.gyan.dev/ffmpeg/builds/
2. Under "release builds", download the `ffmpeg-release-essentials.zip` file
3. Extract the zip somewhere permanent, like `C:\ffmpeg`
4. Inside the extracted folder, find the `bin` subfolder (it contains `ffmpeg.exe`)
5. Add that `bin` folder to your system PATH:
   - Press Windows key, search "environment variables", click "Edit the system environment variables"
   - Click "Environment Variables" button
   - Under "System variables", find `Path`, select it, click "Edit"
   - Click "New" and type the full path to the bin folder, e.g. `C:\ffmpeg\ffmpeg-7.1.1-essentials_build\bin`
   - Click OK on all dialogs

Open a **new** Command Prompt and verify:

```
ffmpeg -version
```

You should see version info. If it says "not recognized", the PATH wasn't set correctly.

## Step 3: Get the project files

Copy the `HearPaulJennings` folder to somewhere on the PC. For this guide we'll use `C:\HearPaulJennings`.

You can get it from a USB drive, a zip file, or by cloning from GitHub:

```
cd C:\
git clone https://github.com/Alx-AI/HearPaulJennings.git
```

## Step 4: Place video files

Download the `OneDrive_1_2-27-2026` folder from Google Drive and place it inside the project so the structure looks like this:

```
C:\HearPaulJennings\
  OneDrive_1_2-27-2026\
    Column B\       (36 .mp4 files)
    Column C\       (36 .mp4 files)
    Column D\       (36 .mp4 files)
    Extra Videos\   (6 .mp4 files)
    layout\         (left_pic.png, right_pic.png, fullmockup.png)
```

Quick count check in Command Prompt:

```
dir "C:\HearPaulJennings\OneDrive_1_2-27-2026\Column B\*.mp4" | find "File(s)"
dir "C:\HearPaulJennings\OneDrive_1_2-27-2026\Column C\*.mp4" | find "File(s)"
dir "C:\HearPaulJennings\OneDrive_1_2-27-2026\Column D\*.mp4" | find "File(s)"
dir "C:\HearPaulJennings\OneDrive_1_2-27-2026\Extra Videos\*.mp4" | find "File(s)"
```

You should see 36, 36, 36, and 6 files respectively.

## Step 5: Install Python packages

Open Command Prompt and run:

```
cd C:\HearPaulJennings
pip install fastapi uvicorn python-multipart httpx sentence-transformers numpy python-dotenv faster-whisper openpyxl
```

This downloads a lot of stuff. Give it a few minutes.

If your CUDA version is 13 or higher (check the `nvidia-smi` output from earlier), also run:

```
pip install nvidia-cublas-cu12
```

## Step 6: Create the config file

In the `C:\HearPaulJennings` folder, create a file called `.env` with this content:

```
STT_BACKEND=whisper
```

You can do this from Command Prompt:

```
cd C:\HearPaulJennings
echo STT_BACKEND=whisper > .env
```

This tells the app to use faster-whisper for speech recognition, which runs on the GPU.

## Step 7: Generate embeddings

The app needs a precomputed file to match spoken questions to answers. If the file `data\embeddings.npy` doesn't already exist, generate it:

```
cd C:\HearPaulJennings
python -c "import numpy as np, json; from sentence_transformers import SentenceTransformer; model = SentenceTransformer('all-MiniLM-L6-v2'); f = open('data/questions.json'); questions = [q for q in json.load(f) if not q.get('is_fallback')]; embeddings = model.encode([q['question'] for q in questions], normalize_embeddings=True); np.save('data/embeddings.npy', embeddings); print(f'Saved {len(embeddings)} embeddings')"
```

This downloads a small AI model on first run (~80 MB) and takes about a minute. You should see "Saved XX embeddings" when it finishes.

## Step 8: Start the server

```
cd C:\HearPaulJennings
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

The first time you run this, it downloads speech recognition models (~250 MB). Wait until you see:

```
INFO:     Application startup complete.
```

If you get an error about `libcublas` or CUDA libraries not being found, run this first, then try again:

```
set PATH=%LOCALAPPDATA%\Programs\Python\Python312\Lib\site-packages\nvidia\cublas\lib;%PATH%
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Windows Firewall may pop up asking to allow Python through the firewall. Click "Allow access".

## Step 9: Open in a browser

Open Chrome or Edge and go to:

```
http://localhost:8080
```

You should see the kiosk screen: a left building illustration, Paul Jennings in the center, and a ship illustration on the right.

## Quick test

1. Click the **?** button (top right) to see the question list
2. Click any question to hear Paul's answer
3. Click the **mic** button to ask by voice
4. Press **D** on the keyboard to toggle debug info

## Running on startup (optional)

To have the kiosk start automatically when the PC boots:

1. Press Windows+R, type `shell:startup`, press Enter
2. In the folder that opens, right-click > New > Shortcut
3. For the location, enter:
   ```
   cmd /k "cd C:\HearPaulJennings && python -m uvicorn app.main:app --host 0.0.0.0 --port 8080"
   ```
4. Name it "HearPaulJennings"
5. Set Chrome or Edge to open `http://localhost:8080` on startup (browser settings > "On startup" > open a specific page)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `libcublas` or CUDA library errors | `pip install nvidia-cublas-cu12` and set PATH (see Step 8) |
| `CUDA out of memory` | Close other programs using the GPU. Run `nvidia-smi` to see what's running. |
| `ffmpeg is not recognized` | Reinstall ffmpeg and make sure the `bin` folder is in your system PATH (Step 2) |
| `python is not recognized` | Reinstall Python and check "Add to PATH" (Step 1). Open a new Command Prompt after installing. |
| Videos don't play | Check folder structure matches Step 4 |
| Mic not working | Browser needs permission. Click the lock icon in the address bar and allow microphone access. Must be on `localhost`, not an IP. |
| `No module named 'faster_whisper'` | `pip install faster-whisper` |
| Server won't start / port in use | Open Task Manager, find any running Python processes, end them, then try again |
| Black screen on idle | Check that `frontend\idle-poster.jpg` exists in the project |
