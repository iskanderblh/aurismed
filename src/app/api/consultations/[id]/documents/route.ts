import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/server/db/client";
import { UUID_RE } from "@/lib/data/consultations";
import { DocumentError, generateDocument } from "@/server/pdf/generate";
import { APP_TIME_ZONE } from "@/lib/time";

export const maxDuration = 60;

const bodySchema = z.object({
  type: z.enum(["observation", "prescription"]),
  timeZone: z.string().max(64).default(APP_TIME_ZONE),
});

/** Génère une nouvelle version du PDF (fiche ou ordonnance) à partir des données validées. */
export async function POST(request: Request, { params }: RouteContext<"/api/consultations/[id]/documents">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, error: "Consultation introuvable." }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400 });

  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, error: "Session expirée. Reconnectez-vous." }, { status: 401 });

  try {
    const doc = await generateDocument(db, auth.user.id, id, parsed.data.type, parsed.data.timeZone);
    return NextResponse.json({ ok: true, document: { id: doc.id, type: doc.document_type, version: doc.version, createdAt: doc.created_at } });
  } catch (error) {
    if (error instanceof DocumentError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    console.error("[pdf] génération", error);
    return NextResponse.json({ ok: false, error: "La génération du PDF a échoué. Réessayez." }, { status: 500 });
  }
}
