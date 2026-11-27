/** Erreurs du moteur IA local, avec un message en français pour le médecin. */

export type LocalAiErrorCode =
  | "engine_down"
  | "model_missing"
  | "loading"
  | "timeout"
  | "bad_audio"
  | "too_large"
  | "invalid_response"
  | "engine_error";

const MESSAGES: Record<LocalAiErrorCode, string> = {
  engine_down:
    "Le moteur IA local ne répond pas. Ouvrez Paramètres > Moteur IA local pour le démarrer ; aucune donnée n'est envoyée en ligne à la place.",
  model_missing: "Aucun modèle local n'est sélectionné ou installé. Choisissez-en un dans Paramètres > Moteur IA local.",
  loading: "Le moteur IA local charge son modèle. Réessayez dans quelques secondes.",
  timeout: "Le moteur IA local n'a pas répondu à temps. Le poste est peut-être trop chargé : réessayez.",
  bad_audio: "Le fichier audio n'a pas pu être lu par le moteur de transcription local.",
  too_large: "Ce segment audio dépasse la taille acceptée par le moteur de transcription local.",
  invalid_response: "La réponse du modèle local était invalide, même après un second essai. Aucune donnée n'a été modifiée.",
  engine_error: "Le moteur IA local a renvoyé une erreur. Consultez Paramètres > Moteur IA local.",
};

export class LocalAiError extends Error {
  constructor(
    readonly code: LocalAiErrorCode,
    readonly engine: "whisper" | "ollama",
    readonly retryable: boolean = code === "loading" || code === "timeout" || code === "engine_error",
  ) {
    super(MESSAGES[code]);
    this.name = "LocalAiError";
  }
}

/** Erreur réseau ou délai dépassé lors d'un appel au moteur local. */
export function networkError(error: unknown, engine: "whisper" | "ollama"): LocalAiError {
  if (error instanceof LocalAiError) return error;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return new LocalAiError("timeout", engine);
  }
  return new LocalAiError("engine_down", engine);
}
