import "server-only";
import { continuityPrompt } from "./medical-prompt";
import { TranscriptionError, type TranscriptionInput, type TranscriptionProvider } from "./provider";

const DEFAULT_MODEL = "gpt-4o-transcribe";
const TIMEOUT_MS = 120_000;

/** Fournisseur OpenAI (API /audio/transcriptions). La clé n'est jamais exposée au navigateur. */
export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly name = "openai";
  readonly model: string;
  readonly maxBytes = 25 * 1024 * 1024;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey: string; model?: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model || DEFAULT_MODEL;
    this.baseUrl = (options.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  }

  async transcribe(input: TranscriptionInput) {
    if (input.audio.size > this.maxBytes) throw new TranscriptionError("too_large", false);

    const form = new FormData();
    form.append("file", input.audio, input.filename);
    form.append("model", this.model);
    form.append("language", input.language);
    form.append("response_format", "json");
    form.append("temperature", "0");
    form.append("prompt", continuityPrompt(input.previousText));

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new TranscriptionError("timeout");
      }
      throw new TranscriptionError("unavailable");
    }

    if (!response.ok) {
      // Le corps d'erreur n'est pas renvoyé au client (il peut citer la requête).
      const detail = await response.text().catch(() => "");
      console.error("[transcription] OpenAI", response.status, detail.slice(0, 300));
      if (response.status === 401 || response.status === 403) throw new TranscriptionError("invalid_key", false);
      if (response.status === 429) throw new TranscriptionError("rate_limited");
      if (response.status === 413) throw new TranscriptionError("too_large", false);
      if (response.status === 400) throw new TranscriptionError("bad_audio", false);
      throw new TranscriptionError("unavailable");
    }

    const data = (await response.json().catch(() => null)) as { text?: unknown } | null;
    if (!data || typeof data.text !== "string") throw new TranscriptionError("unavailable");
    return { text: data.text, provider: this.name, model: this.model };
  }
}
