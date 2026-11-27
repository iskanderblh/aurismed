import { NextResponse } from "next/server";
import { ACCEPTED_AUDIO_TYPES, MAX_SEGMENT_BYTES, baseMime } from "@/lib/recording/types";
import { createClient } from "@/server/db/client";

export const runtime = "nodejs";

/**
 * Réception d'un segment audio : vérifié (session, consultation, type, taille)
 * puis chiffré et écrit dans le stockage local. Le référencement en base est
 * fait ensuite par registerRecording, comme avant.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/consultations/[id]/audio">) {
  const { id } = await ctx.params;
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, error: "Session expirée. Reconnectez-vous." }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Envoi illisible." }, { status: 400 });
  }
  const path = form.get("path");
  const file = form.get("file");
  if (typeof path !== "string" || !(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: "Fichier manquant." }, { status: 400 });
  }
  if (!path.startsWith(`${auth.user.id}/${id}/`) || path.split("/").length !== 3) {
    return NextResponse.json({ ok: false, error: "Chemin non autorisé." }, { status: 403 });
  }
  const type = baseMime(file.type);
  if (!(ACCEPTED_AUDIO_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ ok: false, error: "Format audio non pris en charge." }, { status: 415 });
  }
  if (file.size > MAX_SEGMENT_BYTES) {
    return NextResponse.json({ ok: false, error: "Fichier trop volumineux." }, { status: 413 });
  }

  const { error } = await db.storage.from("recordings").upload(path, file, { contentType: type, upsert: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, path });
}
