import type { Speaker, SpeakerSource, TranscriptionStatus } from "@/types/database";

/** Vue client d'un segment audio (aucun chemin de stockage n'est exposé). */
export type RecordingInfo = {
  id: string;
  segmentIndex: number;
  duration: number | null;
  sizeBytes: number | null;
  source: "microphone" | "upload";
  originalFilename: string | null;
  status: TranscriptionStatus;
  error: string | null;
  hasTranscript: boolean;
  audioAvailable: boolean;
  deleteAfter: string | null;
  createdAt: string;
};

export type TranscriptionInfo = {
  id: string;
  original: string;
  corrected: string;
  confirmedAt: string | null;
  provider: string | null;
  model: string | null;
  updatedAt: string;
};

/** Morceau de transcription en direct (texte stable). */
export type LiveSegmentInfo = {
  id: string;
  seq: number;
  startMs: number;
  endMs: number;
  text: string;
  speaker: Speaker;
  speakerSource: SpeakerSource;
};

export type ConsentInfo = { recordingConsentAt: string | null; aiAcknowledgedAt: string | null };

export type RecordingStageData = {
  userId: string;
  recordings: RecordingInfo[];
  transcription: TranscriptionInfo | null;
  /** Morceaux déjà transcrits en direct (dans l'ordre). */
  liveSegments: LiveSegmentInfo[];
  consent: ConsentInfo;
  /** Transcription locale (whisper.cpp) prête au chargement de la page. */
  providerConfigured: boolean;
  /** Extraction locale (Ollama + modèle choisi) prête au chargement de la page. */
  extractionConfigured: boolean;
  providerLabel: string;
  retentionDays: number;
};

/**
 * Taille maximale d'un segment envoyé au serveur. Les segments sont convertis
 * en WAV 16 kHz mono (32 Ko/s) : 10 minutes ≈ 19 Mo.
 */
export const MAX_SEGMENT_BYTES = 24 * 1024 * 1024;
/** Taille maximale d'un fichier importé (il est ensuite découpé en segments). */
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;
/**
 * Durée d'un segment d'enregistrement micro avant rotation (secondes), et
 * longueur maximale des segments d'un fichier importé.
 * Réglable par NEXT_PUBLIC_RECORDING_SEGMENT_SECONDS (entre 2 et 1800).
 */
export const SEGMENT_SECONDS = (() => {
  const v = Number(process.env.NEXT_PUBLIC_RECORDING_SEGMENT_SECONDS);
  return Number.isFinite(v) && v >= 2 && v <= 1800 ? v : 10 * 60;
})();

export const ACCEPTED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
];

/** Type MIME sans paramètres (« audio/webm;codecs=opus » -> « audio/webm »). */
export function baseMime(mime: string) {
  return mime.split(";")[0].trim().toLowerCase();
}

export function extensionFor(mime: string) {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/flac": "flac",
  };
  return map[baseMime(mime)] ?? "webm";
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
