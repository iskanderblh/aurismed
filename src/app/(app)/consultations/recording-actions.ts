"use server";

import { z } from "zod";
import { createClient } from "@/server/db/client";
import { UUID_RE } from "@/lib/data/consultations";
import { deleteAudioFiles, toRecordingInfo, toTranscriptionInfo } from "@/lib/data/recordings";
import { ACCEPTED_AUDIO_TYPES, MAX_SEGMENT_BYTES, baseMime, type RecordingInfo, type TranscriptionInfo } from "@/lib/recording/types";

type Fail = { ok: false; error: string };

async function context(consultationId: string) {
  if (!UUID_RE.test(consultationId)) return { error: "Consultation introuvable." } as const;
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: "Session expirée. Reconnectez-vous ; l'enregistrement en cours reste dans cette page." } as const;
  const { data: consultation } = await db
    .from("consultations")
    .select("id, status, recording_consent_at, ai_processing_acknowledged_at")
    .eq("id", consultationId)
    .maybeSingle();
  if (!consultation) return { error: "Consultation introuvable." } as const;
  return { db, user: auth.user, consultation } as const;
}

/** Enregistre le consentement du patient et l'information sur l'envoi au fournisseur d'IA. */
export async function acknowledgeConsent(
  consultationId: string,
): Promise<{ ok: true; recordingConsentAt: string; aiAcknowledgedAt: string } | Fail> {
  const ctx = await context(consultationId);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const now = new Date().toISOString();
  const { data, error } = await ctx.db
    .from("consultations")
    .update({
      recording_consent_at: ctx.consultation.recording_consent_at ?? now,
      ai_processing_acknowledged_at: ctx.consultation.ai_processing_acknowledged_at ?? now,
      status: ctx.consultation.status === "draft" ? "in_progress" : ctx.consultation.status,
    })
    .eq("id", consultationId)
    .select("recording_consent_at, ai_processing_acknowledged_at")
    .single();
  if (error) return { ok: false, error: "Le consentement n'a pas pu être enregistré." };
  await ctx.db.from("audit_logs").insert({
    user_id: ctx.user.id,
    consultation_id: consultationId,
    action: "consultation.consent_recorded",
    entity_type: "consultation",
    entity_id: consultationId,
  });
  return { ok: true, recordingConsentAt: data.recording_consent_at!, aiAcknowledgedAt: data.ai_processing_acknowledged_at! };
}

const registerSchema = z.object({
  path: z.string().min(1).max(300),
  segmentIndex: z.number().int().min(0).max(10_000),
  duration: z.number().min(0).max(24 * 3600).nullable(),
  sizeBytes: z.number().int().min(1).max(MAX_SEGMENT_BYTES),
  mimeType: z.string().max(100),
  source: z.enum(["microphone", "upload"]),
  originalFilename: z.string().max(255).nullable(),
});

/** Enregistre les métadonnées d'un segment déjà déposé dans le bucket privé. */
export async function registerRecording(
  consultationId: string,
  input: z.input<typeof registerSchema>,
): Promise<{ ok: true; recording: RecordingInfo } | Fail> {
  const ctx = await context(consultationId);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  if (!ctx.consultation.recording_consent_at) return { ok: false, error: "Le consentement à l'enregistrement n'est pas enregistré." };

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Segment audio invalide." };
  const v = parsed.data;
  if (!v.path.startsWith(`${ctx.user.id}/${consultationId}/`) || v.path.includes("..")) {
    return { ok: false, error: "Emplacement de fichier non autorisé." };
  }
  if (!ACCEPTED_AUDIO_TYPES.includes(baseMime(v.mimeType))) return { ok: false, error: "Format audio non pris en charge." };

  const { data, error } = await ctx.db
    .from("recordings")
    .insert({
      consultation_id: consultationId,
      user_id: ctx.user.id,
      storage_path: v.path,
      segment_index: v.segmentIndex,
      duration: v.duration,
      size_bytes: v.sizeBytes,
      mime_type: baseMime(v.mimeType),
      source: v.source,
      original_filename: v.originalFilename,
    })
    .select("*")
    .single();
  if (error) {
    console.error("[enregistrement] métadonnées", error.code, error.message);
    return {
      ok: false,
      error: error.code === "23505" ? "Ce segment est déjà enregistré." : "Le segment a été envoyé mais n'a pas pu être référencé.",
    };
  }
  await ctx.db.from("audit_logs").insert({
    user_id: ctx.user.id,
    consultation_id: consultationId,
    action: v.source === "upload" ? "recording.imported" : "recording.uploaded",
    entity_type: "recording",
    entity_id: data.id,
    metadata: { segment: v.segmentIndex, bytes: v.sizeBytes },
  });
  return { ok: true, recording: toRecordingInfo(data) };
}

/** URL signée de courte durée pour réécouter un segment (jamais d'URL publique). */
export async function getPlaybackUrl(consultationId: string, recordingId: string): Promise<{ ok: true; url: string } | Fail> {
  const ctx = await context(consultationId);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  if (!UUID_RE.test(recordingId)) return { ok: false, error: "Segment introuvable." };
  const { data: rec } = await ctx.db
    .from("recordings")
    .select("storage_path, deleted_at")
    .eq("id", recordingId)
    .eq("consultation_id", consultationId)
    .maybeSingle();
  if (!rec || rec.deleted_at) return { ok: false, error: "Audio supprimé ou introuvable." };
  const { data, error } = await ctx.db.storage.from("recordings").createSignedUrl(rec.storage_path, 300);
  if (error || !data) return { ok: false, error: "Lecture impossible pour le moment." };
  return { ok: true, url: data.signedUrl };
}

/**
 * Supprime tout l'audio de la consultation et la transcription associée, pour
 * recommencer l'enregistrement.
 */
export async function deleteAllRecordings(consultationId: string): Promise<{ ok: true } | Fail> {
  const ctx = await context(consultationId);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const { data: rows, error } = await ctx.db.from("recordings").select("id, storage_path, deleted_at").eq("consultation_id", consultationId);
  if (error) return { ok: false, error: "Les enregistrements n'ont pas pu être lus." };

  // Fichiers orphelins éventuels (envoi interrompu avant référencement) : on vide tout le dossier.
  const prefix = `${ctx.user.id}/${consultationId}`;
  const { data: files } = await ctx.db.storage.from("recordings").list(prefix, { limit: 1000 });
  const paths = new Set([...(files ?? []).map((f) => `${prefix}/${f.name}`), ...(rows ?? []).filter((r) => !r.deleted_at).map((r) => r.storage_path)]);
  if (paths.size) {
    const { error: removeError } = await ctx.db.storage.from("recordings").remove([...paths]);
    if (removeError) return { ok: false, error: "La suppression des fichiers audio a échoué. Rien n'a été effacé." };
  }
  const del = await ctx.db.from("recordings").delete().eq("consultation_id", consultationId);
  const delT = await ctx.db.from("transcriptions").delete().eq("consultation_id", consultationId);
  const delS = await ctx.db.from("transcription_segments").delete().eq("consultation_id", consultationId);
  if (del.error || delT.error || delS.error) return { ok: false, error: "Les fichiers ont été supprimés mais pas leurs références. Réessayez." };
  await ctx.db.from("audit_logs").insert({
    user_id: ctx.user.id,
    consultation_id: consultationId,
    action: "recording.deleted_all",
    entity_type: "consultation",
    entity_id: consultationId,
    metadata: { files: paths.size },
  });
  return { ok: true };
}

const transcriptSchema = z.string().max(500_000, "Transcription trop longue");

/** Enregistre la version corrigée de la transcription (brouillon). */
export async function saveTranscriptCorrection(
  consultationId: string,
  text: string,
): Promise<{ ok: true; updatedAt: string } | Fail> {
  const ctx = await context(consultationId);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const parsed = transcriptSchema.safeParse(text);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { data, error } = await ctx.db
    .from("transcriptions")
    .update({ corrected_transcript: parsed.data })
    .eq("consultation_id", consultationId)
    .select("updated_at")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "La correction n'a pas pu être enregistrée." };
  return { ok: true, updatedAt: data.updated_at };
}

/**
 * Confirme la transcription corrigée. Démarre le délai de conservation de l'audio
 * (suppression immédiate si la durée configurée est 0).
 */
export async function confirmTranscription(
  consultationId: string,
  text: string,
): Promise<{ ok: true; transcription: TranscriptionInfo; recordings: RecordingInfo[] } | Fail> {
  const ctx = await context(consultationId);
  if ("error" in ctx) return { ok: false, error: ctx.error! };
  const parsed = transcriptSchema.safeParse(text);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!parsed.data.trim()) return { ok: false, error: "La transcription est vide." };

  const now = new Date();
  const { data: transcription, error } = await ctx.db
    .from("transcriptions")
    .update({ corrected_transcript: parsed.data, confirmed_at: now.toISOString() })
    .eq("consultation_id", consultationId)
    .select("*")
    .maybeSingle();
  if (error || !transcription) return { ok: false, error: "La transcription n'a pas pu être confirmée." };

  const { data: settings } = await ctx.db.from("user_settings").select("audio_retention_days").eq("user_id", ctx.user.id).maybeSingle();
  const days = settings?.audio_retention_days ?? 30;
  const deleteAfter = new Date(now.getTime() + days * 86_400_000).toISOString();
  await ctx.db.from("recordings").update({ delete_after: deleteAfter }).eq("consultation_id", consultationId).is("deleted_at", null);
  if (days === 0) {
    const { data: rows } = await ctx.db.from("recordings").select("id, storage_path").eq("consultation_id", consultationId).is("deleted_at", null);
    await deleteAudioFiles(ctx.db, rows ?? []);
  }
  await ctx.db.from("audit_logs").insert({
    user_id: ctx.user.id,
    consultation_id: consultationId,
    action: "transcription.confirmed",
    entity_type: "transcription",
    entity_id: transcription.id,
    metadata: { audio_retention_days: days },
  });

  const { data: recordings } = await ctx.db.from("recordings").select("*").eq("consultation_id", consultationId).order("segment_index");
  return { ok: true, transcription: toTranscriptionInfo(transcription), recordings: (recordings ?? []).map(toRecordingInfo) };
}
