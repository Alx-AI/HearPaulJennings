// Hear Paul Jennings — Frontend Logic (V2)

const player = document.getElementById("player");
const captionOverlay = document.getElementById("caption-overlay");
const askBtn = document.getElementById("ask-btn");
const recordingIndicator = document.getElementById("recording-indicator");
const processingIndicator = document.getElementById("processing-indicator");
const statusBar = document.getElementById("status-bar");
const statusText = document.getElementById("status-text");
const waveformCanvas = document.getElementById("waveform");
const promptText = document.getElementById("prompt-text");
const questionList = document.getElementById("question-list");
const skipBtn = document.getElementById("skip-btn");

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// State machine: idle → recording → processing → playing → walkoff → idle
let state = "idle";
let expectedVideo = null; // track which video we're waiting on
let videoGeneration = 0; // increments each playVideo call to ignore stale events
let currentGeneration = 0; // set when video actually starts playing
let lastResponseWasProfanity = false; // walkoff only after profanity detected

const INTRO_VIDEO = "/videos/Extra Videos/Intro.mp4";
const WALKOFF_VIDEO = "/videos/Extra Videos/Jennings Walks Off (1).mp4";
const IDLE_POSTER = "idle-poster.jpg";

// Waveform visualization state
let audioContext = null;
let analyserNode = null;
let waveformAnimId = null;

// Track which question button is active
let activeQuestionBtn = null;

// Preloader — hidden video element to buffer upcoming videos
const preloader = document.createElement("video");
preloader.preload = "auto";
preloader.muted = true;
preloader.style.display = "none";
document.body.appendChild(preloader);

// Pre-buffer walkoff video since it's always needed after answers
function preloadVideo(url) {
  preloader.src = url;
  preloader.load();
}

// ─── Idle State ───

function showIdle() {
  // Fade out video, revealing the poster background behind it
  player.classList.add("fade-out");
  setTimeout(() => {
    player.pause();
    player.removeAttribute("src");
    player.load();
    captionOverlay.classList.add("hidden");
    setState("idle");
    clearActiveQuestion();
    // Keep video transparent in idle — panel background shows the poster
  }, 400);
}

// ─── Initialization ───

async function init() {
  player.preload = "auto";

  // Start with video hidden — CSS background on #video-panel shows the poster
  player.classList.add("fade-out");

  // Pre-buffer walkoff video
  preloadVideo(WALKOFF_VIDEO);

  // Load question list into sidebar
  loadQuestions();

  // Try to play intro — but don't block forever
  setState("intro");
  skipBtn.classList.remove("hidden");

  const playPromise = playVideo(INTRO_VIDEO);
  const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve("timeout"), 8000));
  const result = await Promise.race([playPromise, timeoutPromise]);

  if (result === "timeout") {
    // Video took too long to buffer — skip to idle
    player.pause();
    skipBtn.classList.add("hidden");
    showIdle();
  } else if (!result) {
    // Autoplay blocked — show tap-to-start overlay
    skipBtn.classList.add("hidden");
    showTapToStart();
  }
}

function skipIntro() {
  if (state !== "intro") return;
  player.pause();
  skipBtn.classList.add("hidden");
  showIdle();
}

// Overlay for when autoplay is blocked by browser policy
function showTapToStart() {
  const overlay = document.createElement("div");
  overlay.id = "tap-overlay";
  overlay.innerHTML = "<span>Touch to Begin</span>";
  document.getElementById("app").appendChild(overlay);

  overlay.addEventListener(
    "click",
    () => {
      overlay.remove();
      player.muted = false;
      setState("intro");
      skipBtn.classList.remove("hidden");
      playVideo(INTRO_VIDEO);
    },
    { once: true }
  );
}

// ─── Question List ───

async function loadQuestions() {
  try {
    const res = await fetch("/api/questions");
    if (!res.ok) return;
    const questions = await res.json();

    questionList.innerHTML = "";
    for (const q of questions) {
      const btn = document.createElement("button");
      btn.className = "question-btn";
      btn.textContent = q.question;
      btn.dataset.questionId = q.id;
      btn.addEventListener("click", () => askQuestion(q.question, btn));
      questionList.appendChild(btn);
    }
  } catch (e) {
    // Questions will just not appear — mic still works
  }
}

async function askQuestion(text, btn) {
  if (state !== "idle") return;

  // Highlight the tapped question
  setActiveQuestion(btn);

  // Ensure player is unmuted (user gesture from tap)
  player.muted = false;

  setState("processing");
  showStatus(`Asking: "${text}"`);

  try {
    const response = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Server error (${response.status})`);
    }

    const data = await response.json();
    handleResponse(data);
  } catch (err) {
    showStatus(`Error: ${err.message}`);
    setState("idle");
    clearActiveQuestion();
  }
}

function setActiveQuestion(btn) {
  clearActiveQuestion();
  btn.classList.add("active");
  activeQuestionBtn = btn;
}

function clearActiveQuestion() {
  if (activeQuestionBtn) {
    activeQuestionBtn.classList.remove("active");
    activeQuestionBtn = null;
  }
}

// ─── State Management ───

function setState(newState) {
  state = newState;

  // Drive all CSS transitions via data attribute
  document.body.dataset.state = newState;

  // Button
  askBtn.disabled = newState !== "idle";

  // Indicators — use opacity transitions instead of display:none
  recordingIndicator.classList.toggle("hidden", newState !== "recording");
  processingIndicator.classList.toggle("hidden", newState !== "processing");

  // Waveform visibility
  waveformCanvas.classList.toggle("hidden", newState !== "recording");

  // Disable question buttons during non-idle states
  const qBtns = questionList.querySelectorAll(".question-btn");
  for (const b of qBtns) {
    b.disabled = newState !== "idle";
  }

  // During recording, allow click to stop
  if (newState === "recording") {
    askBtn.disabled = false;
  }
}

// ─── Video Playback ───

function playVideo(url, caption) {
  return new Promise((resolve) => {
    const gen = ++videoGeneration;
    expectedVideo = url;

    // Fade out before switching video source
    player.classList.add("fade-out");

    setTimeout(() => {
      player.src = url;
      player.load();

      // Mark this generation as active once actually playing
      player.addEventListener(
        "playing",
        () => {
          currentGeneration = gen;
        },
        { once: true }
      );

      // Wait for enough data to start playing
      player.addEventListener(
        "canplay",
        () => {
          player.classList.remove("fade-out");
          player.play()
            .then(() => resolve(true))
            .catch(() => {
              // Autoplay blocked — try muted
              player.muted = true;
              player.play()
                .then(() => resolve(false)) // played but muted
                .catch(() => resolve(false));
            });
        },
        { once: true }
      );

      if (caption) {
        captionOverlay.textContent = caption;
        captionOverlay.classList.remove("hidden");
      } else {
        captionOverlay.classList.add("hidden");
      }
    }, 300); // Match fade-out duration
  });
}

player.addEventListener("ended", () => {
  // Ignore ended events from videos that never actually played
  if (currentGeneration !== videoGeneration) return;

  if (state === "intro") {
    // Intro finished — hide skip button, show idle poster
    skipBtn.classList.add("hidden");
    showIdle();
  } else if (state === "playing") {
    // Answer finished — return to idle poster
    showIdle();
  } else if (state === "walkoff") {
    // Walkoff finished — return to idle poster
    showIdle();
  }
});

// ─── Audio Recording ───

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];

    // Ensure player is unmuted after user interaction (mic grant = user gesture)
    player.muted = false;

    // Prefer webm, fall back to whatever is available
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      stopWaveform();
      const blob = new Blob(audioChunks, {
        type: mediaRecorder.mimeType || "audio/webm",
      });
      await processAudio(blob);
    };

    mediaRecorder.start();
    setState("recording");

    // Start waveform visualization
    startWaveform(stream);

    // Auto-stop after 15 seconds
    setTimeout(() => {
      if (isRecording && mediaRecorder && mediaRecorder.state === "recording") {
        stopRecording();
      }
    }, 15000);

    isRecording = true;
  } catch (err) {
    showStatus(
      "Microphone access denied. Please allow microphone access and try again."
    );
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    isRecording = false;
    mediaRecorder.stop();
    setState("processing");
  }
}

// ─── Waveform Visualization (Web Audio API) ───

function startWaveform(stream) {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 64;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyserNode);

    const canvas = waveformCanvas;
    const ctx = canvas.getContext("2d");
    canvas.width = 120;
    canvas.height = 40;

    const barCount = 7;
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);

    function draw() {
      waveformAnimId = requestAnimationFrame(draw);
      analyserNode.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = 6;
      const gap = (canvas.width - barCount * barWidth) / (barCount + 1);

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i + 1] / 255;
        const minHeight = 4;
        const barHeight = minHeight + value * (canvas.height - minHeight);

        const x = gap + i * (barWidth + gap);
        const y = (canvas.height - barHeight) / 2;

        ctx.fillStyle = `rgba(196, 162, 90, ${0.5 + value * 0.5})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }
    }

    draw();
  } catch (e) {
    // Web Audio not supported — waveform just won't show
  }
}

function stopWaveform() {
  if (waveformAnimId) {
    cancelAnimationFrame(waveformAnimId);
    waveformAnimId = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
    analyserNode = null;
  }
  const ctx = waveformCanvas.getContext("2d");
  ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
}

// ─── API Communication ───

async function processAudio(blob) {
  showStatus("Processing your question...");

  const formData = new FormData();
  formData.append("audio", blob, "recording.webm");

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Server error (${response.status})`);
    }

    const data = await response.json();
    handleResponse(data);
  } catch (err) {
    showStatus(`Error: ${err.message}`);
    setState("idle");
  }
}

function handleResponse(data) {
  if (data.is_profanity) {
    showStatus(`Profanity detected: "${data.transcription}" — playing walkoff`);
    lastResponseWasProfanity = true;
    setState("walkoff");
    playVideo(WALKOFF_VIDEO);
    return;
  }

  const info = data.is_fallback
    ? `I didn't quite catch that (confidence: ${data.confidence})`
    : `Matched: "${data.matched_question}" (${data.confidence})`;
  showStatus(`You said: "${data.transcription}" — ${info}`);

  if (data.video_url) {
    lastResponseWasProfanity = false;
    setState("playing");
    playVideo(data.video_url);
  } else {
    showStatus("No video available for this response.");
    setState("idle");
  }
}

// ─── UI Helpers ───

function showStatus(msg) {
  statusText.textContent = msg;
}

// ─── Keyboard Toggles ───

let debugVisible = false;
const questionPanel = document.getElementById("question-panel");

document.addEventListener("keydown", (e) => {
  if (e.key === "d" || e.key === "D") {
    debugVisible = !debugVisible;
    statusBar.classList.toggle("hidden", !debugVisible);
  }
  if (e.key === "q" || e.key === "Q") {
    questionPanel.classList.toggle("panel-hidden");
  }
});

// ─── Event Listeners ───

skipBtn.addEventListener("click", skipIntro);

askBtn.addEventListener("click", () => {
  if (state === "recording") {
    stopRecording();
  } else if (state === "idle") {
    player.pause();
    startRecording();
  }
});

// ─── Start ───

init();
