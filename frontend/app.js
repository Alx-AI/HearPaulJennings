// Hear Paul Jennings — Frontend Logic

const player = document.getElementById("player");
const captionOverlay = document.getElementById("caption-overlay");
const askBtn = document.getElementById("ask-btn");
const btnLabel = document.getElementById("btn-label");
const recordingIndicator = document.getElementById("recording-indicator");
const processingIndicator = document.getElementById("processing-indicator");
const statusBar = document.getElementById("status-bar");
const statusText = document.getElementById("status-text");

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// State machine: idle → recording → processing → playing → walkoff → idle
let state = "idle";
let expectedVideo = null; // track which video we're waiting on

const INTRO_VIDEO = "/videos/Extra Videos/Intro.mp4";
const WALKOFF_VIDEO = "/videos/Extra Videos/Jennings Walks Off (1).mp4";

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

// ─── Initialization ───

async function init() {
  player.preload = "auto";
  setState("idle");

  // Pre-buffer walkoff video
  preloadVideo(WALKOFF_VIDEO);

  // Try autoplay — browsers may block it if audio is enabled
  playVideo(INTRO_VIDEO).then((played) => {
    if (!played) {
      // Autoplay blocked — show tap-to-start overlay
      showTapToStart();
    }
  });
}

// Overlay for when autoplay is blocked by browser policy
function showTapToStart() {
  const overlay = document.createElement("div");
  overlay.id = "tap-overlay";
  overlay.innerHTML = "<span>Touch to Begin</span>";
  document.getElementById("video-container").appendChild(overlay);

  overlay.addEventListener(
    "click",
    () => {
      overlay.remove();
      player.muted = false;
      playVideo(INTRO_VIDEO);
    },
    { once: true }
  );
}

// ─── State Management ───

function setState(newState) {
  state = newState;

  // Button
  askBtn.disabled = newState !== "idle";
  askBtn.classList.toggle("recording", newState === "recording");
  btnLabel.textContent =
    newState === "recording" ? "Stop Recording" : "Ask a Question";

  // Indicators
  recordingIndicator.classList.toggle("hidden", newState !== "recording");
  processingIndicator.classList.toggle("hidden", newState !== "processing");

  // During recording, allow click to stop
  if (newState === "recording") {
    askBtn.disabled = false;
  }
}

// ─── Video Playback ───

function playVideo(url, caption) {
  return new Promise((resolve) => {
    expectedVideo = url;
    player.src = url;
    player.load();

    // Wait for enough data buffered before playing
    player.addEventListener(
      "canplaythrough",
      () => {
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
  });
}

player.addEventListener("ended", () => {
  // Ignore spurious ended events from src changes
  if (!player.src.includes(expectedVideo)) return;

  if (state === "playing") {
    // Play walk-off, then return to idle
    setState("walkoff");
    captionOverlay.classList.add("hidden");
    playVideo(WALKOFF_VIDEO);
  } else if (state === "walkoff") {
    setState("idle");
    playVideo(INTRO_VIDEO);
    // Pre-buffer walkoff for next round
    preloadVideo(WALKOFF_VIDEO);
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
      const blob = new Blob(audioChunks, {
        type: mediaRecorder.mimeType || "audio/webm",
      });
      await processAudio(blob);
    };

    mediaRecorder.start();
    setState("recording");

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
  const info = data.is_fallback
    ? `I didn't quite catch that (confidence: ${data.confidence})`
    : `Matched: "${data.matched_question}" (${data.confidence})`;
  showStatus(`You said: "${data.transcription}" — ${info}`);

  if (data.video_url) {
    setState("playing");
    playVideo(data.video_url, data.answer);
  } else {
    showStatus("No video available for this response.");
    setState("idle");
  }
}

// ─── UI Helpers ───

function showStatus(msg) {
  statusText.textContent = msg;
  statusBar.classList.remove("hidden");
}

// ─── Event Listeners ───

askBtn.addEventListener("click", () => {
  if (state === "recording") {
    stopRecording();
  } else if (state === "idle") {
    // Pause intro if playing
    player.pause();
    startRecording();
  }
});

// ─── Start ───

init();
