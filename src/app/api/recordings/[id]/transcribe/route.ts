import { NextResponse } from "next/server";
import { createClient } from "@/server/db/client";
import { UUID_RE } from "@/lib/data/consultations";
import { toRecordingInfo } from "@/lib/data/recordings";
import { LocalAiError } from "@/server/local-ai/errors";
import { localMedicalAI } from "@/server/local-ai/service";

export const maxDuration = 900;

/** Transcrit un segment audio. Le texte est stocké sur le segment, puis assemblé par /transcription. */
export async function POST(_request: Request, { params }: RouteContext<"/api/recordings/[id]/transcribe">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "Segment introuvable." }, { status: 404 });

  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, error: "Session expirée. Reconnectez-vous." }, { status: 401 });

  const { data: rec } = await db.from("recordings").select("*").eq("id", id).maybeSingle();
  if (!rec) return NextResponse.json({ ok: false, error: "Segment introuvable." }, { status: 404 });
  if (rec.deleted_at) return NextResponse.json({ ok: false, error: "L'audio de ce segment a été supprimé." }, { status: 410 });

  const { data: consultation } = await db
    .from("consultations")
    .select("ai_processing_acknowledged_at")
    .eq("id", rec.consultation_id)
    .maybeSingle();
  if (!consultation?.ai_processing_acknowledged_at) {
    return NextResponse.json(
      { ok: false, error: "L'information sur l'analyse par l'IA locale n'a pas été validée." },
      { status: 403 },
    );
  }

  await db.from("recordings").update({ transcription_status: "processing", transcription_error: null }).eq("id", id);

  const fail = async (message: string, retryable: boolean, status: number) => {
    const { data } = await db
      .from("recordings")
      .update({ transcription_status: "failed", transcription_error: message })
      .eq("id", id)
      .select("*")
      .single();
    return NextResponse.json({ ok: false, error: message, retryable, recording: data ? toRecordingInfo(data) : undefined }, { status });
  };

  const { data: audio, error: downloadError } = await db.storage.from("recordings").download(rec.storage_path);
  if (downloadError || !audio) return fail("Le fichier audio n'a pas pu être lu depuis le stockage.", true, 502);

  // Fin du segment précédent pour la continuité du texte.
  const { data: previous } = await db
    .from("recordings")
    .select("transcript")
    .eq("consultation_id", rec.consultation_id)
    .lt("segment_index", rec.segment_index)
    .not("transcript", "is", null)
    .order("segment_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  try {
    const result = await localMedicalAI.transcribe({
      audio,
      filename: rec.storage_path.split("/").pop() ?? "audio.webm",
      language: "fr",
      previousText: previous?.transcript ?? undefined,
    });
    const { data } = await db
      .from("recordings")
      .update({ transcription_status: "completed", transcription_error: null, transcript: result.text })
      .eq("id", id)
      .select("*")
      .single();
    return NextResponse.json({ ok: true, recording: data ? toRecordingInfo(data) : undefined, provider: result.provider, model: result.model });
  } catch (error) {
    if (error instanceof LocalAiError) return fail(error.message, error.retryable, 503);
    console.error("[transcription] erreur inattendue", error);
    return fail("La transcription a échoué de façon inattendue.", true, 500);
  }
}
