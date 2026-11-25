import "server-only";
import { OpenAITranscriptionProvider } from "./openai";
import { TranscriptionError, type TranscriptionProvider } from "./provider";

export { TranscriptionError } from "./provider";
export type { TranscriptionProvider } from "./provider";

/**
 * Sélection du fournisseur (TRANSCRIPTION_PROVIDER, « openai » par défaut).
 * Lève TranscriptionError("not_configured") si les identifiants manquent.
 */
export function getTranscriptionProvider(): TranscriptionProvider {
  const provider = process.env.TRANSCRIPTION_PROVIDER ?? "openai";
  switch (provider) {
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new TranscriptionError("not_configured", false);
      return new OpenAITranscriptionProvider({
        apiKey,
        model: process.env.OPENAI_TRANSCRIPTION_MODEL,
        baseUrl: process.env.OPENAI_BASE_URL,
      });
    }
    default:
      throw new TranscriptionError("not_configured", false);
  }
}
