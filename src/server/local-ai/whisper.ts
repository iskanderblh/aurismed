import "server-only";
import { continuityPrompt } from "@/server/transcription/medical-prompt";
import type { TranscriptionInput, TranscriptionOutput, TranscriptionProvider } from "@/server/transcription/provider";
import { selectedWhisperModel, whisperUrl } from "./config";
import { LocalAiError, networkError } from "./errors";

const TIMEOUT_MS = 10 * 60_000;

export type WhisperHealth = { status: "ok" | "loading" | "down"; url: string };

export async function whisperHealth(): Promise<WhisperHealth> {
  const url = whisperUrl();
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000), cache: "no-store" });
    if (res.ok) return { status: "ok", url };
    if (res.status === 503) return { status: "loading", url };
    return { status: "down", url };
  } catch {
    return { status: "down", url };
  }
}

export type WhisperSegment = { start: number; end: number; text: string; noSpeechProb?: number };

/**
 * Transcription par le serveur whisper.cpp local (POST /inference).
 * L'audio doit être en WAV 16 kHz mono (converti dans le navigateur).
 */
export class WhisperCppProvider implements TranscriptionProvider {
  readonly name = "whisper.cpp";
  readonly maxBytes = 50 * 1024 * 1024;
  get model() {
    return selectedWhisperModel() ?? "inconnu";
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionOutput & { segments: WhisperSegment[] }> {
    if (input.audio.size > this.maxBytes) throw new LocalAiError("too_large", "whisper", false);

    const form = new FormData();
    form.append("file", input.audio, input.filename);
    form.append("language", input.language || "fr");
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    form.append("prompt", continuityPrompt(input.previousText));

    let response: Response;
    try {
      response = await fetch(`${whisperUrl()}/inference`, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw networkError(error, "whisper");
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[transcription] whisper.cpp", response.status, detail.slice(0, 300));
      if (response.status === 503) throw new LocalAiError("loading", "whisper");
      if (response.status === 413) throw new LocalAiError("too_large", "whisper", false);
      if (response.status === 400) throw new LocalAiError("bad_audio", "whisper", false);
      throw new LocalAiError("engine_error", "whisper");
    }

    const data = (await response.json().catch(() => null)) as {
      text?: unknown;
      error?: unknown;
      segments?: { start?: number; end?: number; text?: string; no_speech_prob?: number }[];
    } | null;
    if (data && typeof data.error === "string") {
      console.error("[transcription] whisper.cpp", data.error.slice(0, 300));
      throw new LocalAiError("bad_audio", "whisper", false);
    }
    if (!data || typeof data.text !== "string") throw new LocalAiError("invalid_response", "whisper", false);
    const segments = (data.segments ?? []).map((s) => ({
      start: Number(s.start ?? 0),
      end: Number(s.end ?? 0),
      text: String(s.text ?? "").trim(),
      noSpeechProb: s.no_speech_prob,
    }));
    return { text: data.text.trim(), segments, provider: this.name, model: this.model };
  }
}
