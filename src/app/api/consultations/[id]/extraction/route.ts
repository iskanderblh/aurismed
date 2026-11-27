import { NextResponse } from "next/server";
import { createClient } from "@/server/db/client";
import { UUID_RE } from "@/lib/data/consultations";
import { formDataSchema, type ObservationFormData } from "@/lib/medical/form-state";
import { LocalAiError } from "@/server/local-ai/errors";
import { localMedicalAI } from "@/server/local-ai/service";
import { processExtraction } from "@/server/ai/process";
import { syncConsultationStatus } from "@/lib/data/consultation-status";
import type { Json } from "@/types/database";

// Sur processeur seul, l'analyse locale peut prendre plusieurs minutes.
export const maxDuration = 900;

/**
 * Analyse la transcription confirmée et propose des valeurs pour la fiche
 * d'observation. La réponse de l'IA est validée puis fusionnée sans jamais
 * écraser ce que le médecin a saisi ou confirmé. La fiche repasse « à vérifier ».
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/consultations/[id]/extraction">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "Consultation introuvable." }, { status: 404 });

  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, error: "Session expirée. Reconnectez-vous." }, { status: 401 });

  const [{ data: consultation }, { data: transcription }, { data: existing }] = await Promise.all([
    db.from("consultations").select("id, ai_processing_acknowledged_at").eq("id", id).maybeSingle(),
    db.from("transcriptions").select("corrected_transcript, original_transcript, confirmed_at").eq("consultation_id", id).maybeSingle(),
    db.from("observation_forms").select("id, form_data").eq("consultation_id", id).maybeSingle(),
  ]);
  if (!consultation) return NextResponse.json({ ok: false, error: "Consultation introuvable." }, { status: 404 });
  if (!consultation.ai_processing_acknowledged_at) {
    return NextResponse.json({ ok: false, error: "L'information sur l'analyse par l'IA locale n'a pas été validée." }, { status: 403 });
  }
  if (!transcription?.confirmed_at) {
    return NextResponse.json({ ok: false, error: "Confirmez d'abord la transcription." }, { status: 409 });
  }
  const text = (transcription.corrected_transcript ?? transcription.original_transcript).trim();
  if (!text) return NextResponse.json({ ok: false, error: "La transcription est vide." }, { status: 409 });

  const previous = existing ? formDataSchema.safeParse(existing.form_data) : null;

  let form: ObservationFormData;
  let model: string;
  try {
    const result = await localMedicalAI.extractObservation(text);
    model = result.model;
    form = processExtraction(result.output, text, previous?.success ? (previous.data as ObservationFormData) : null, { model });
    // Trace de la réponse brute validée, distincte des valeurs de la fiche.
    const aiExtraction = { model, at: form.extractedAt, output: result.output } as unknown as Json;
    const values = {
      consultation_id: id,
      user_id: auth.user.id,
      form_data: form as unknown as Json,
      ai_extraction: aiExtraction,
      validation_status: "ai_extracted" as const,
      validated_at: null,
    };
    const { error } = existing
      ? await db.from("observation_forms").update(values).eq("id", existing.id)
      : await db.from("observation_forms").insert(values);
    if (error) {
      console.error("[extraction] sauvegarde", error.code, error.message);
      return NextResponse.json({ ok: false, error: "L'analyse a réussi mais la fiche n'a pas pu être enregistrée. Réessayez." }, { status: 500 });
    }
  } catch (error) {
    if (error instanceof LocalAiError) {
      return NextResponse.json({ ok: false, error: error.message, retryable: error.retryable, code: error.code }, { status: 503 });
    }
    console.error("[extraction] erreur inattendue", error);
    return NextResponse.json({ ok: false, error: "L'analyse a échoué de façon inattendue. Aucune donnée n'a été modifiée." }, { status: 500 });
  }

  await db.from("audit_logs").insert({
    user_id: auth.user.id,
    consultation_id: id,
    action: "observation.ai_extracted",
    entity_type: "observation_form",
    metadata: { model, fields: Object.values(form.fields).filter((f) => f.status === "extracted" || f.status === "needs_verification").length, medications: form.medications.length },
  });
  await syncConsultationStatus(db, id);
  return NextResponse.json({ ok: true, form, validationStatus: "ai_extracted" });
}
