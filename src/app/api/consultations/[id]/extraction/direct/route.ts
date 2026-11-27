import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID_RE } from "@/lib/data/consultations";
import { FIELD_BY_PATH } from "@/lib/medical/catalog";
import { formDataSchema, isEmptyValue, type FieldValue } from "@/lib/medical/form-state";
import { createClient } from "@/server/db/client";
import { buildProposals } from "@/server/ai/incremental";
import type { PromptSegment } from "@/server/ai/prompt";
import { LocalAiError } from "@/server/local-ai/errors";
import { localMedicalAI } from "@/server/local-ai/service";

export const maxDuration = 900;

/** Nombre maximal de nouvelles répliques analysées par appel (le reste au suivant). */
const MAX_NEW = 40;
const CONTEXT = 4;

const bodySchema = z.object({
  afterSeq: z.number().int().min(-1),
  mode: z.enum(["incremental", "reconcile"]),
});

const display = (v: FieldValue | null) => (typeof v === "boolean" ? (v ? "oui" : "non") : Array.isArray(v) ? v.join(", ") : String(v));

/**
 * Analyse médicale locale au fil de la consultation.
 * - incremental : seules les répliques stables après `afterSeq` sont analysées
 *   (avec quelques répliques de contexte) ;
 * - reconcile : relecture de toute la transcription en direct, à la fin.
 * Renvoie des propositions validées (citations retrouvées dans les répliques,
 * valeurs compatibles avec les champs) ; la fiche n'est PAS modifiée ici : le
 * navigateur les fusionne sans écraser aucun champ déjà rempli, puis
 * l'enregistrement passe par la validation habituelle de la fiche.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/consultations/[id]/extraction/direct">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "Consultation introuvable." }, { status: 404 });
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, error: "Session expirée. Reconnectez-vous." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 });
  const { afterSeq, mode } = parsed.data;

  const [{ data: consultation }, { data: rows, error }, { data: saved }] = await Promise.all([
    db.from("consultations").select("id, ai_processing_acknowledged_at").eq("id", id).maybeSingle(),
    db.from("transcription_segments").select("seq, start_ms, text, speaker").eq("consultation_id", id).order("seq"),
    db.from("observation_forms").select("form_data, validation_status").eq("consultation_id", id).maybeSingle(),
  ]);
  if (!consultation) return NextResponse.json({ ok: false, error: "Consultation introuvable." }, { status: 404 });
  if (!consultation.ai_processing_acknowledged_at) {
    return NextResponse.json({ ok: false, error: "L'information sur l'analyse par l'IA locale n'a pas été validée." }, { status: 403 });
  }
  if (saved?.validation_status === "validated") {
    return NextResponse.json({ ok: false, error: "La fiche est validée : l'analyse automatique est arrêtée.", retryable: false }, { status: 409 });
  }
  if (error) return NextResponse.json({ ok: false, error: "Lecture de la transcription impossible." }, { status: 500 });

  const all: PromptSegment[] = (rows ?? []).map((r) => ({ seq: r.seq, startMs: r.start_ms, text: r.text, speaker: r.speaker }));
  const lastSeq = all.at(-1)?.seq ?? afterSeq;
  let segments: PromptSegment[];
  let context: PromptSegment[] = [];
  let toSeq: number;
  if (mode === "reconcile") {
    segments = all.filter((s) => s.text.trim());
    toSeq = lastSeq;
  } else {
    const pending = all.filter((s) => s.seq > afterSeq);
    const batch = pending.slice(0, MAX_NEW);
    toSeq = batch.at(-1)?.seq ?? afterSeq;
    segments = batch.filter((s) => s.text.trim());
    context = all.filter((s) => s.seq <= afterSeq && s.text.trim()).slice(-CONTEXT);
  }
  if (!segments.length) return NextResponse.json({ ok: true, toSeq, proposals: null, model: null });

  // Valeurs déjà présentes (fiche enregistrée), pour que le modèle signale les contradictions.
  const form = saved ? formDataSchema.safeParse(saved.form_data) : null;
  const current = form?.success
    ? Object.entries(form.data.fields)
        .filter(([, s]) => !isEmptyValue(s.value))
        .slice(0, 120)
        .map(([path, s]) => ({ path, label: FIELD_BY_PATH.get(path)?.label ?? path, value: display(s.value) }))
    : [];

  try {
    const started = Date.now();
    const result = await localMedicalAI.extractFromSegments({ segments, context, current, full: mode === "reconcile" });
    const proposals = buildProposals(result.output, segments, { full: mode === "reconcile" });
    await db.from("audit_logs").insert({
      user_id: auth.user.id,
      consultation_id: id,
      action: mode === "reconcile" ? "observation.ai_reconciled" : "observation.ai_incremental",
      entity_type: "observation_form",
      metadata: {
        model: result.model,
        repliques: segments.length,
        jusqu_a: toSeq,
        champs: proposals.fields.length,
        medicaments: proposals.medications.length,
        ms: Date.now() - started,
      },
    });
    return NextResponse.json({ ok: true, toSeq, proposals, model: result.model, ms: Date.now() - started });
  } catch (e) {
    if (e instanceof LocalAiError) return NextResponse.json({ ok: false, error: e.message, retryable: e.retryable }, { status: 503 });
    console.error("[extraction directe] erreur inattendue", e);
    return NextResponse.json({ ok: false, error: "L'analyse a échoué de façon inattendue. La fiche n'a pas été modifiée.", retryable: true }, { status: 500 });
  }
}
