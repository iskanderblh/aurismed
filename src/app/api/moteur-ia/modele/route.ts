import { NextResponse } from "next/server";
import { z } from "zod";
import { localMedicalAI } from "@/server/local-ai/service";
import { audit, requireUser } from "../guard";

const bodySchema = z.object({ engine: z.enum(["whisper", "ollama"]), name: z.string().min(1).max(200) });

/** Choix du modèle parmi ceux déjà installés sur le poste (aucun téléchargement). */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 });
  const { engine, name } = parsed.data;
  try {
    if (engine === "whisper") localMedicalAI.selectWhisperModel(name);
    else await localMedicalAI.selectOllamaModel(name);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
  await audit(user, "local_ai.model_selected", { engine, model: name });
  return NextResponse.json({
    ok: true,
    message:
      engine === "whisper"
        ? "Modèle de transcription choisi. Redémarrez la transcription locale pour l'appliquer."
        : "Modèle d'analyse choisi. Il sera utilisé dès la prochaine analyse.",
  });
}
