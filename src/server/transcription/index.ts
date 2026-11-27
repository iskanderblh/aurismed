import "server-only";
import { localMedicalAI } from "@/server/local-ai/service";
import type { TranscriptionProvider } from "./provider";

export type { TranscriptionProvider } from "./provider";

/**
 * Fournisseur de transcription : uniquement le moteur local (whisper.cpp).
 * Il n'existe volontairement aucun autre fournisseur ni repli en ligne.
 */
export function getTranscriptionProvider(): TranscriptionProvider {
  return localMedicalAI.transcriptionProvider();
}
