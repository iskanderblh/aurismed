import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/data/consultations";
import { toLiveSegmentInfo } from "@/lib/data/recordings";
import { mergeOverlap } from "@/lib/recording/vad";
import { baseMime } from "@/lib/recording/types";
import { createClient } from "@/server/db/client";
import { LocalAiError } from "@/server/local-ai/errors";
import { localMedicalAI } from "@/server/local-ai/service";
import { cleanLiveText } from "@/server/transcription/live";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Un morceau de parole dure au plus ~25 s (WAV 16 kHz mono : 32 Ko/s). */
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;

const int = (v: FormDataEntryValue | null, max: number) => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n <= max ? n : null;
};

/**
 * Transcription en direct d'un morceau de parole découpé dans le navigateur.
 * - kind=partial : texte provisoire, renvoyé sans rien enregistrer ;
 * - kind=final   : texte stable, enregistré comme morceau de la consultation
 *   (un nouvel envoi du même numéro remplace le texte : reprise après erreur).
 * L'audio du morceau n'est pas conservé ici : l'enregistrement complet est
 * stocké, chiffré, par /audio.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/consultations/[id]/direct">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "Consultation introuvable." }, { status: 404 });
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, error: "Session expirée. Reconnectez-vous." }, { status: 401 });

  const { data: consultation } = await db
    .from("consultations")
    .select("id, ai_processing_acknowledged_at")
    .eq("id", id)
    .maybeSingle();
  if (!consultation) return NextResponse.json({ ok: false, error: "Consultation introuvable." }, { status: 404 });
  if (!consultation.ai_processing_acknowledged_at) {
    return NextResponse.json({ ok: false, error: "L'information sur l'analyse par l'IA locale n'a pas été validée." }, { status: 403 });
  }
  const { data: transcription } = await db.from("transcriptions").select("confirmed_at").eq("consultation_id", id).maybeSingle();
  if (transcription?.confirmed_at) {
    return NextResponse.json({ ok: false, error: "La transcription est déjà confirmée.", retryable: false }, { status: 409 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Envoi illisible." }, { status: 400 });
  }
  const file = form.get("file");
  const kind = form.get("kind");
  const seq = int(form.get("seq"), 1_000_000);
  const startMs = int(form.get("startMs"), 24 * 3_600_000);
  const endMs = int(form.get("endMs"), 24 * 3_600_000);
  const overlapMs = int(form.get("overlapMs"), 60_000) ?? 0;
  if (!(file instanceof Blob) || (kind !== "partial" && kind !== "final") || seq === null || startMs === null || endMs === null || endMs < startMs) {
    return NextResponse.json({ ok: false, error: "Morceau audio invalide." }, { status: 400 });
  }
  if (!["audio/wav", "audio/x-wav"].includes(baseMime(file.type))) {
    return NextResponse.json({ ok: false, error: "Format audio non pris en charge." }, { status: 415 });
  }
  if (file.size > MAX_CHUNK_BYTES) return NextResponse.json({ ok: false, error: "Morceau trop long." }, { status: 413 });

  const { data: previous } = await db
    .from("transcription_segments")
    .select("seq, text")
    .eq("consultation_id", id)
    .lt("seq", seq)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  let text: string;
  let model: string;
  try {
    const result = await localMedicalAI.transcribe({
      audio: file,
      filename: `direct-${seq}.wav`,
      language: "fr",
      previousText: previous?.text || undefined,
    });
    model = result.model;
    text = cleanLiveText(result.text, result.segments);
  } catch (error) {
    if (error instanceof LocalAiError) {
      return NextResponse.json({ ok: false, error: error.message, retryable: error.retryable }, { status: 503 });
    }
    console.error("[direct] erreur inattendue", error);
    return NextResponse.json({ ok: false, error: "La transcription a échoué de façon inattendue.", retryable: true }, { status: 500 });
  }
  // Début repris du morceau précédent (coupure au milieu d'une phrase) : mots en double retirés.
  if (overlapMs > 0 && previous && previous.seq === seq - 1) text = mergeOverlap(previous.text, text);

  if (kind === "partial") return NextResponse.json({ ok: true, kind, seq, text });

  const { data: existing } = await db.from("transcription_segments").select("id").eq("consultation_id", id).eq("seq", seq).maybeSingle();
  const { data: row, error } = existing
    ? await db
        .from("transcription_segments")
        .update({ text, model })
        .eq("id", existing.id)
        .select("*")
        .single()
    : await db
        .from("transcription_segments")
        .insert({ consultation_id: id, user_id: auth.user.id, seq, start_ms: startMs, end_ms: endMs, text, model })
        .select("*")
        .single();
  if (error || !row) {
    console.error("[direct] sauvegarde", error?.code, error?.message);
    return NextResponse.json({ ok: false, error: "Le morceau transcrit n'a pas pu être enregistré.", retryable: true }, { status: 500 });
  }
  return NextResponse.json({ ok: true, kind, segment: toLiveSegmentInfo(row) });
}
