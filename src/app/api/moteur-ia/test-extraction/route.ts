import { NextResponse } from "next/server";
import { LocalAiError } from "@/server/local-ai/errors";
import { localMedicalAI } from "@/server/local-ai/service";
import { audit, requireUser } from "../guard";

export const maxDuration = 900;

/** Analyse d'une consultation fictive (données synthétiques) pour vérifier le modèle local et mesurer sa durée. */
export async function POST() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  try {
    const result = await localMedicalAI.testExtraction();
    await audit(user, "local_ai.test_extraction", { ok: true, model: result.model, seconds: Math.round(result.seconds) });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    await audit(user, "local_ai.test_extraction", { ok: false });
    const message = e instanceof LocalAiError ? e.message : "Le test d'analyse a échoué.";
    if (!(e instanceof LocalAiError)) console.error("[moteur local] test d'analyse", e);
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
