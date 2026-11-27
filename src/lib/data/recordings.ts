import "server-only";
import type { DbClient } from "@/server/db/client";
import { selectedOllamaModel, selectedWhisperModel } from "@/server/local-ai/config";
import { ollamaHealth } from "@/server/local-ai/ollama";
import { whisperHealth } from "@/server/local-ai/whisper";
import { createClient } from "@/server/db/client";
import type { Tables } from "@/types/database";
import type { LiveSegmentInfo, RecordingInfo, RecordingStageData, TranscriptionInfo } from "@/lib/recording/types";

type Client = DbClient;

/** État des moteurs locaux au chargement de la page (affichage d'un avertissement, sans bloquer). */
async function localEngineReadiness() {
  const [w, o] = await Promise.all([whisperHealth(), ollamaHealth()]);
  return {
    providerConfigured: w.status === "ok" && Boolean(selectedWhisperModel()),
    extractionConfigured: o.status === "ok" && Boolean(selectedOllamaModel()),
  };
}

export function toRecordingInfo(r: Tables<"recordings">): RecordingInfo {
  return {
    id: r.id,
    segmentIndex: r.segment_index,
    duration: r.duration,
    sizeBytes: r.size_bytes,
    source: r.source,
    originalFilename: r.original_filename,
    status: r.transcription_status,
    error: r.transcription_error,
    hasTranscript: Boolean(r.transcript),
    audioAvailable: !r.deleted_at,
    deleteAfter: r.delete_after,
    createdAt: r.created_at,
  };
}

export function toLiveSegmentInfo(s: Tables<"transcription_segments">): LiveSegmentInfo {
  return {
    id: s.id,
    seq: s.seq,
    startMs: s.start_ms,
    endMs: s.end_ms,
    text: s.text,
    speaker: s.speaker,
    speakerSource: s.speaker_source,
  };
}

export function toTranscriptionInfo(t: Tables<"transcriptions">): TranscriptionInfo {
  return {
    id: t.id,
    original: t.original_transcript,
    corrected: t.corrected_transcript ?? t.original_transcript,
    confirmedAt: t.confirmed_at,
    provider: t.provider,
    model: t.model,
    updatedAt: t.updated_at,
  };
}

export async function getRecordingStageData(
  userId: string,
  consultation: Pick<Tables<"consultations">, "id" | "recording_consent_at" | "ai_processing_acknowledged_at"> | null,
): Promise<RecordingStageData> {
  const db = await createClient();
  const settings = await db.from("user_settings").select("audio_retention_days").eq("user_id", userId).maybeSingle();
  const base: RecordingStageData = {
    userId,
    recordings: [],
    transcription: null,
    liveSegments: [],
    consent: {
      recordingConsentAt: consultation?.recording_consent_at ?? null,
      aiAcknowledgedAt: consultation?.ai_processing_acknowledged_at ?? null,
    },
    ...(await localEngineReadiness()),
    providerLabel: "l'IA locale de ce poste (whisper.cpp et Ollama)",
    retentionDays: settings.data?.audio_retention_days ?? 30,
  };
  if (!consultation) return base;

  const [recordings, transcription, live] = await Promise.all([
    db.from("recordings").select("*").eq("consultation_id", consultation.id).order("segment_index"),
    db.from("transcriptions").select("*").eq("consultation_id", consultation.id).maybeSingle(),
    db.from("transcription_segments").select("*").eq("consultation_id", consultation.id).order("seq"),
  ]);
  if (recordings.error || transcription.error || live.error) {
    throw new Error("Lecture des enregistrements impossible");
  }
  return {
    ...base,
    recordings: (recordings.data ?? []).map(toRecordingInfo),
    transcription: transcription.data ? toTranscriptionInfo(transcription.data) : null,
    liveSegments: (live.data ?? []).map(toLiveSegmentInfo),
  };
}

/**
 * Supprime l'audio dont la durée de conservation est écoulée (après confirmation
 * de la transcription). Appelée à l'ouverture du tableau de bord et des consultations.
 */
export async function purgeExpiredAudio(db: Client): Promise<number> {
  const { data, error } = await db
    .from("recordings")
    .select("id, storage_path")
    .lte("delete_after", new Date().toISOString())
    .is("deleted_at", null)
    .limit(200);
  if (error || !data?.length) return 0;
  return deleteAudioFiles(db, data);
}

/** Supprime les fichiers puis marque les lignes comme supprimées (les métadonnées restent). */
export async function deleteAudioFiles(db: Client, rows: { id: string; storage_path: string }[]) {
  if (!rows.length) return 0;
  const { error } = await db.storage.from("recordings").remove(rows.map((r) => r.storage_path));
  if (error) {
    console.error("[rétention] suppression des fichiers", error.message);
    return 0;
  }
  await db
    .from("recordings")
    .update({ deleted_at: new Date().toISOString() })
    .in(
      "id",
      rows.map((r) => r.id),
    );
  return rows.length;
}

export type ObservationStageData = {
  form: import("@/lib/medical/form-state").ObservationFormData | null;
  validationStatus: import("@/types/database").ObservationValidationStatus | null;
  validatedAt: string | null;
};

/** Fiche d'observation enregistrée (validée par le schéma ; null si absente ou illisible). */
export async function getObservationStageData(consultationId: string | null): Promise<ObservationStageData> {
  if (!consultationId) return { form: null, validationStatus: null, validatedAt: null };
  const { formDataSchema } = await import("@/lib/medical/form-state");
  const db = await createClient();
  const { data } = await db
    .from("observation_forms")
    .select("form_data, validation_status, validated_at")
    .eq("consultation_id", consultationId)
    .maybeSingle();
  if (!data) return { form: null, validationStatus: null, validatedAt: null };
  const parsed = formDataSchema.safeParse(data.form_data);
  return {
    form: parsed.success ? (parsed.data as import("@/lib/medical/form-state").ObservationFormData) : null,
    validationStatus: data.validation_status,
    validatedAt: data.validated_at,
  };
}
