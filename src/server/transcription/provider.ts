/**
 * Interface des fournisseurs de transcription. Seul le moteur local
 * (whisper.cpp, src/server/local-ai/whisper.ts) l'implémente : aucun service
 * en ligne ne doit être ajouté (cahier des charges : traitement 100 % local).
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
