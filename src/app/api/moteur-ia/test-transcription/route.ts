import { NextResponse } from "next/server";
import { LocalAiError } from "@/server/local-ai/errors";
import { localMedicalAI } from "@/server/local-ai/service";
import { audit, requireUser } from "../guard";

export const maxDuration = 300;

/**
 * Test de transcription : quelques secondes enregistrées au micro, transcrites
 * puis oubliées. Rien n'est conservé (ni l'audio, ni le texte).
 */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const form = await request.formData().catch(() => null);
  const audio = form?.get("file");
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > 5 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Audio de test manquant ou trop long." }, { status: 400 });
  }
  const started = Date.now();
  try {
    const result = await localMedicalAI.transcribe({ audio, filename: "test.wav", language: "fr" });
    const seconds = (Date.now() - started) / 1000;
    await audit(user, "local_ai.test_transcription", { ok: true, model: result.model, seconds: Math.round(seconds) });
    return NextResponse.json({ ok: true, text: result.text, model: result.model, seconds });
  } catch (e) {
    await audit(user, "local_ai.test_transcription", { ok: false });
    const message = e instanceof LocalAiError ? e.message : "Le test de transcription a échoué.";
    if (!(e instanceof LocalAiError)) console.error("[moteur local] test de transcription", e);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
