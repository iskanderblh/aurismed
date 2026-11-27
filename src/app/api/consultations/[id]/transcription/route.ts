import { NextResponse } from "next/server";
import { selectedWhisperModel } from "@/server/local-ai/config";
import { createClient } from "@/server/db/client";
import { UUID_RE } from "@/lib/data/consultations";
import { toTranscriptionInfo } from "@/lib/data/recordings";
import { joinSegments, toParagraphs } from "@/server/transcription/paragraphs";

/**
 * Assemble les segments transcrits (dans l'ordre) en une transcription unique,
 * mise en paragraphes. Remplace une transcription non confirmée ; une transcription
 * confirmée n'est jamais écrasée.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/consultations/[id]/transcription">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "Consultation introuvable." }, { status: 404 });

  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, error: "Session expirée. Reconnectez-vous." }, { status: 401 });

  const { data: segments, error } = await db
    .from("recordings")
    .select("segment_index, transcription_status, transcript, deleted_at")
    .eq("consultation_id", id)
    .order("segment_index");
  if (error) return NextResponse.json({ ok: false, error: "Lecture des segments impossible." }, { status: 500 });
  if (!segments?.length) return NextResponse.json({ ok: false, error: "Aucun enregistrement à transcrire." }, { status: 400 });
  const missing = segments.filter((s) => s.transcription_status !== "completed");
  if (missing.length) {
    return NextResponse.json(
      { ok: false, error: `${missing.length} segment(s) ne sont pas encore transcrits.` },
      { status: 409 },
    );
  }

  const { data: existing } = await db.from("transcriptions").select("id, confirmed_at").eq("consultation_id", id).maybeSingle();
  if (existing?.confirmed_at) {
    return NextResponse.json(
      { ok: false, error: "La transcription est déjà confirmée. Supprimez l'enregistrement pour recommencer." },
      { status: 409 },
    );
  }

  const text = joinSegments(segments.map((s) => toParagraphs(s.transcript ?? "")));
  const values = {
    consultation_id: id,
    user_id: auth.user.id,
    original_transcript: text,
    corrected_transcript: text,
    language: "fr",
    provider: "whisper.cpp",
    model: selectedWhisperModel(),
    confirmed_at: null,
  };
  const { data, error: saveError } = existing
    ? await db.from("transcriptions").update(values).eq("id", existing.id).select("*").single()
    : await db.from("transcriptions").insert(values).select("*").single();
  if (saveError || !data) {
    console.error("[transcription] sauvegarde", saveError?.code, saveError?.message);
    return NextResponse.json({ ok: false, error: "La transcription n'a pas pu être enregistrée." }, { status: 500 });
  }
  await db.from("audit_logs").insert({
    user_id: auth.user.id,
    consultation_id: id,
    action: "transcription.created",
    entity_type: "transcription",
    entity_id: data.id,
    metadata: { segments: segments.length },
  });
  return NextResponse.json({ ok: true, transcription: toTranscriptionInfo(data) });
}
