import "server-only";
import { createClient } from "@/server/db/client";
import { sanitizeSearch } from "@/lib/consultation/schema";
import type {
  ConsultationStatus,
  ObservationValidationStatus,
  PrescriptionValidationStatus,
  Tables,
  TranscriptionStatus,
} from "@/types/database";
import type { Result } from "./dashboard";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getConsultation(id: string): Promise<Result<Tables<"consultations"> | null>> {
  if (!UUID_RE.test(id)) return { ok: true, data: null };
  const db = await createClient();
  const { data, error } = await db.from("consultations").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[consultation] lecture", error.code, error.message);
    return { ok: false, error: "Impossible de charger la consultation." };
  }
  return { ok: true, data };
}

export type HistoryItem = {
  id: string;
  patient_name: string | null;
  patient_first_name: string | null;
  consultation_date: string;
  updated_at: string;
  status: ConsultationStatus;
  transcription: TranscriptionStatus | "none";
  observation: ObservationValidationStatus | "none";
  prescription: PrescriptionValidationStatus | "none";
  documents: number;
};

/** Historique : consultations du médecin (RLS), recherche par nom ou prénom du patient. */
export async function listConsultations(query?: string): Promise<Result<HistoryItem[]>> {
  const db = await createClient();
  let request = db
    .from("consultations")
    .select("id, patient_name, patient_first_name, consultation_date, updated_at, status")
    .order("consultation_date", { ascending: false })
    .limit(100);

  const q = sanitizeSearch(query);
  if (q) {
    const terms = q.split(" ").slice(0, 3);
    // Chaque mot doit correspondre au nom ou au prénom.
    for (const term of terms) {
      request = request.or(`patient_name.ilike.*${term}*,patient_first_name.ilike.*${term}*`);
    }
  }

  const { data: rows, error } = await request;
  if (error) {
    console.error("[historique] lecture", error.code, error.message);
    return { ok: false, error: "Impossible de charger l'historique." };
  }
  if (!rows.length) return { ok: true, data: [] };

  const ids = rows.map((r) => r.id);
  const [recordings, transcriptions, forms, prescriptions, documents] = await Promise.all([
    db.from("recordings").select("consultation_id, transcription_status").in("consultation_id", ids),
    db.from("transcriptions").select("consultation_id").in("consultation_id", ids),
    db.from("observation_forms").select("consultation_id, validation_status").in("consultation_id", ids),
    db.from("prescriptions").select("consultation_id, validation_status").in("consultation_id", ids),
    db.from("generated_documents").select("consultation_id").in("consultation_id", ids),
  ]);
  const failed = [recordings, transcriptions, forms, prescriptions, documents].find((r) => r.error);
  if (failed?.error) {
    console.error("[historique] statuts", failed.error.code, failed.error.message);
    return { ok: false, error: "Impossible de charger les statuts des consultations." };
  }

  const transcribed = new Set((transcriptions.data ?? []).map((t) => t.consultation_id));
  const recordingStatus = new Map<string, TranscriptionStatus>();
  for (const r of recordings.data ?? []) {
    const prev = recordingStatus.get(r.consultation_id);
    // Le statut le moins avancé l'emporte (un segment en échec rend la consultation « en échec »).
    const rank: Record<TranscriptionStatus, number> = { failed: 0, pending: 1, processing: 2, completed: 3 };
    if (!prev || rank[r.transcription_status] < rank[prev]) recordingStatus.set(r.consultation_id, r.transcription_status);
  }
  const formStatus = new Map((forms.data ?? []).map((f) => [f.consultation_id, f.validation_status]));
  const rxStatus = new Map((prescriptions.data ?? []).map((p) => [p.consultation_id, p.validation_status]));
  const docCount = new Map<string, number>();
  for (const d of documents.data ?? []) docCount.set(d.consultation_id, (docCount.get(d.consultation_id) ?? 0) + 1);

  return {
    ok: true,
    data: rows.map((r) => ({
      ...r,
      transcription: transcribed.has(r.id) ? "completed" : (recordingStatus.get(r.id) ?? "none"),
      observation: formStatus.get(r.id) ?? "none",
      prescription: rxStatus.get(r.id) ?? "none",
      documents: docCount.get(r.id) ?? 0,
    })),
  };
}
