import { NextResponse } from "next/server";
import { z } from "zod";
import { localMedicalAI } from "@/server/local-ai/service";
import { audit, requireUser } from "../guard";

const bodySchema = z.object({ engine: z.enum(["whisper", "ollama"]), action: z.enum(["start", "restart"]) });

/** Démarre ou redémarre un moteur local. */
export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 });
  const { engine, action } = parsed.data;
  const result = action === "start" ? await localMedicalAI.start(engine) : await localMedicalAI.restart(engine);
  await audit(user, `local_ai.${action}`, { engine, ok: result.ok });
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
