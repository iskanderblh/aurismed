import { NextResponse } from "next/server";
import { createClient } from "@/server/db/client";
import { UUID_RE } from "@/lib/data/consultations";
import { documentFileName } from "@/server/pdf/model";

/**
 * Ouvre (ou télécharge avec ?download=1) un PDF : vérifie l'accès via la RLS
 * puis redirige vers une URL signée valable 60 secondes.
 */
export async function GET(request: Request, { params }: RouteContext<"/api/documents/[id]">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return new NextResponse("Document introuvable.", { status: 404 });
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return new NextResponse(null, { status: 307, headers: { Location: "/connexion" } });

  const { data: doc } = await db
    .from("generated_documents")
    .select("id, document_type, version, storage_path, consultation_id")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("Document introuvable.", { status: 404 });
  const { data: c } = await db.from("consultations").select("patient_name, consultation_date").eq("id", doc.consultation_id).maybeSingle();

  const download = new URL(request.url).searchParams.get("download") === "1";
  const fileName = documentFileName(doc.document_type, c?.patient_name ?? undefined, c?.consultation_date ?? new Date().toISOString(), doc.version);
  const { data: signed, error } = await db.storage.from("documents").createSignedUrl(doc.storage_path, 60, { download: download ? fileName : false });
  if (error || !signed) {
    console.error("[documents] URL signée", error?.message);
    return new NextResponse("Le document n'est pas disponible pour le moment.", { status: 502 });
  }
  if (download) {
    await db.from("audit_logs").insert({
      user_id: auth.user.id,
      consultation_id: doc.consultation_id,
      action: "document.downloaded",
      entity_type: "generated_document",
      entity_id: doc.id,
    });
  }
  // Redirection relative : l'hôte reste celui du navigateur (127.0.0.1), qui porte le cookie de session.
  return new NextResponse(null, { status: 307, headers: { Location: signed.signedUrl, "Cache-Control": "no-store" } });
}
