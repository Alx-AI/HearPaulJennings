"""Speech-to-text transcription via NVIDIA Parakeet (local GPU) or Groq API (fallback)."""

import io
import tempfile
from abc import ABC, abstractmethod

import httpx

from app.config import GROQ_API_KEY, STT_BACKEND


class Transcriber(ABC):
    @abstractmethod
    async def transcribe(self, audio_bytes: bytes, content_type: str = "audio/webm") -> str:
        ...


class LocalTranscriber(Transcriber):
    """NVIDIA Parakeet TDT 0.6B v2 via NeMo. Requires CUDA."""

    def __init__(self):
        import nemo.collections.asr as nemo_asr

        self.model = nemo_asr.models.ASRModel.from_pretrained(
            "nvidia/parakeet-tdt-0.6b-v2"
        )
        # Switch from greedy_batch to greedy to avoid CUDA graphs
        # (CUDA graphs are broken with CUDA 13 + this PyTorch build)
        from omegaconf import OmegaConf
        decoding_cfg = OmegaConf.create({
            "strategy": "greedy",
            "model_type": "tdt",
            "durations": [0, 1, 2, 3, 4],
            "greedy": {"max_symbols": 10},
        })
        self.model.change_decoding_strategy(decoding_cfg)

    async def transcribe(self, audio_bytes: bytes, content_type: str = "audio/webm") -> str:
        import soundfile as sf
        import numpy as np

        # Convert incoming audio to WAV for Parakeet
        with tempfile.NamedTemporaryFile(suffix=self._ext(content_type), delete=False) as tmp_in:
            tmp_in.write(audio_bytes)
            tmp_in_path = tmp_in.name

        # Use ffmpeg to convert to 16kHz mono WAV (Parakeet requirement)
        import subprocess

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
            tmp_wav_path = tmp_wav.name

        subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_in_path, "-ar", "16000", "-ac", "1", tmp_wav_path],
            capture_output=True,
        )

        transcriptions = self.model.transcribe([tmp_wav_path])
        # NeMo returns list of strings or list of Hypothesis objects
        if isinstance(transcriptions[0], str):
            return transcriptions[0]
        return transcriptions[0].text

    @staticmethod
    def _ext(content_type: str) -> str:
        if "webm" in content_type:
            return ".webm"
        if "wav" in content_type:
            return ".wav"
        if "ogg" in content_type:
            return ".ogg"
        return ".webm"


class WhisperTranscriber(Transcriber):
    """faster-whisper running on GPU. Lighter than Parakeet, works on restricted networks."""

    def __init__(self):
        from faster_whisper import WhisperModel
        self.model = WhisperModel("base.en", device="cuda", compute_type="float16")

    async def transcribe(self, audio_bytes: bytes, content_type: str = "audio/webm") -> str:
        import subprocess

        with tempfile.NamedTemporaryFile(suffix=self._ext(content_type), delete=False) as tmp_in:
            tmp_in.write(audio_bytes)
            tmp_in_path = tmp_in.name

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
            tmp_wav_path = tmp_wav.name

        subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_in_path, "-ar", "16000", "-ac", "1", tmp_wav_path],
            capture_output=True,
        )

        segments, _ = self.model.transcribe(tmp_wav_path, language="en")
        return " ".join(seg.text for seg in segments).strip()

    @staticmethod
    def _ext(content_type: str) -> str:
        if "webm" in content_type:
            return ".webm"
        if "wav" in content_type:
            return ".wav"
        if "ogg" in content_type:
            return ".ogg"
        return ".webm"


class GroqTranscriber(Transcriber):
    API_URL = "https://api.groq.com/openai/v1/audio/transcriptions"

    async def transcribe(self, audio_bytes: bytes, content_type: str = "audio/webm") -> str:
        ext = "webm" if "webm" in content_type else "wav"
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self.API_URL,
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                files={"file": (f"audio.{ext}", audio_bytes, content_type)},
                data={
                    "model": "whisper-large-v3-turbo",
                    "response_format": "json",
                    "language": "en",
                },
            )
            response.raise_for_status()
            return response.json()["text"]


def get_transcriber() -> Transcriber:
    if STT_BACKEND == "local":
        return LocalTranscriber()
    if STT_BACKEND == "whisper":
        return WhisperTranscriber()
    return GroqTranscriber()
