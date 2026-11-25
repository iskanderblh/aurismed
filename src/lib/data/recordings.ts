import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database, Tables } from "@/types/database";
import type { RecordingInfo, RecordingStageData, TranscriptionInfo } from "@/lib/recording/types";

type Client = SupabaseClient<Database>;

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
  const supabase = await createClient();
  const settings = await supabase.from("user_settings").select("audio_retention_days").eq("user_id", userId).maybeSingle();
  const base: RecordingStageData = {
    userId,
    recordings: [],
    transcription: null,
    consent: {
      recordingConsentAt: consultation?.recording_consent_at ?? null,
      aiAcknowledgedAt: consultation?.ai_processing_acknowledged_at ?? null,
    },
    providerConfigured: Boolean(process.env.OPENAI_API_KEY),
    providerLabel: "OpenAI",
    retentionDays: settings.data?.audio_retention_days ?? 30,
  };
  if (!consultation) return base;

  const [recordings, transcription] = await Promise.all([
    supabase.from("recordings").select("*").eq("consultation_id", consultation.id).order("segment_index"),
    supabase.from("transcriptions").select("*").eq("consultation_id", consultation.id).maybeSingle(),
  ]);
  if (recordings.error || transcription.error) {
    throw new Error("Lecture des enregistrements impossible");
  }
  return {
    ...base,
    recordings: (recordings.data ?? []).map(toRecordingInfo),
    transcription: transcription.data ? toTranscriptionInfo(transcription.data) : null,
  };
}

/**
 * Supprime l'audio dont la durée de conservation est écoulée (après confirmation
 * de la transcription). Appelée à l'ouverture du tableau de bord et des consultations.
 */
export async function purgeExpiredAudio(supabase: Client): Promise<number> {
  const { data, error } = await supabase
    .from("recordings")
    .select("id, storage_path")
    .lte("delete_after", new Date().toISOString())
    .is("deleted_at", null)
    .limit(200);
  if (error || !data?.length) return 0;
  return deleteAudioFiles(supabase, data);
}

/** Supprime les fichiers puis marque les lignes comme supprimées (les métadonnées restent). */
export async function deleteAudioFiles(supabase: Client, rows: { id: string; storage_path: string }[]) {
  if (!rows.length) return 0;
  const { error } = await supabase.storage.from("recordings").remove(rows.map((r) => r.storage_path));
  if (error) {
    console.error("[rétention] suppression des fichiers", error.message);
    return 0;
  }
  await supabase
    .from("recordings")
    .update({ deleted_at: new Date().toISOString() })
    .in(
      "id",
      rows.map((r) => r.id),
    );
  return rows.length;
}
