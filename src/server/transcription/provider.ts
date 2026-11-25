/**
 * Interface commune des fournisseurs de transcription. Pour en ajouter un
 * (Whisper auto-hébergé, Azure, Deepgram...), implémenter cette interface et
 * l'enregistrer dans ./index.ts.
 */
export type TranscriptionInput = {
  audio: Blob;
  filename: string;
  /** Code ISO 639-1, « fr » par défaut. */
  language: string;
  /** Fin du segment précédent, pour garder la continuité entre segments. */
  previousText?: string;
};

export type TranscriptionOutput = { text: string; provider: string; model: string };

export interface TranscriptionProvider {
  readonly name: string;
  readonly model: string;
  /** Taille maximale acceptée par le fournisseur, en octets. */
  readonly maxBytes: number;
  transcribe(input: TranscriptionInput): Promise<TranscriptionOutput>;
}

export type TranscriptionErrorCode =
  | "not_configured"
  | "invalid_key"
  | "rate_limited"
  | "too_large"
  | "bad_audio"
  | "unavailable"
  | "timeout";

const MESSAGES: Record<TranscriptionErrorCode, string> = {
  not_configured: "La transcription n'est pas configurée : OPENAI_API_KEY est absente du serveur.",
  invalid_key: "La clé du service de transcription est invalide ou révoquée.",
  rate_limited: "Le service de transcription limite les requêtes ou le quota est atteint. Réessayez dans un moment.",
  too_large: "Ce segment audio dépasse la taille acceptée par le service de transcription.",
  bad_audio: "Le fichier audio n'a pas pu être lu par le service de transcription.",
  unavailable: "Le service de transcription est momentanément indisponible. Réessayez.",
  timeout: "Le service de transcription n'a pas répondu à temps. Réessayez.",
};

export class TranscriptionError extends Error {
  constructor(
    readonly code: TranscriptionErrorCode,
    readonly retryable: boolean = code === "rate_limited" || code === "unavailable" || code === "timeout",
  ) {
    super(MESSAGES[code]);
    this.name = "TranscriptionError";
  }
}
