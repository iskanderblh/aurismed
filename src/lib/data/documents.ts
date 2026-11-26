import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DocumentType } from "@/types/database";
import type { Result } from "./dashboard";

export type DocumentInfo = {
  id: string;
  type: DocumentType;
  version: number;
  createdAt: string;
  consultationId: string;
  patient: string;
  consultationDate: string | null;
  /** Dernière version de ce type pour cette consultation. */
  latest: boolean;
};

const patientLabel = (c?: { patient_name: string | null; patient_first_name: string | null }) =>
  [c?.patient_name?.toUpperCase(), c?.patient_first_name].filter(Boolean).join(" ") || "Patient non renseigné";

/** Documents générés (RLS : uniquement ceux du médecin connecté), du plus récent au plus ancien. */
export async function listDocuments(opts: { consultationId?: string; type?: DocumentType; limit?: number } = {}): Promise<Result<DocumentInfo[]>> {
  const supabase = await createClient();
  let q = supabase
    .from("generated_documents")
    .select("id, document_type, version, created_at, consultation_id")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.consultationId) q = q.eq("consultation_id", opts.consultationId);
  if (opts.type) q = q.eq("document_type", opts.type);
  const { data, error } = await q;
  if (error) {
    console.error("[documents] lecture", error.code, error.message);
    return { ok: false, error: "Impossible de charger les documents." };
  }
  const ids = [...new Set(data.map((d) => d.consultation_id))];
  const consultations = new Map<string, { patient_name: string | null; patient_first_name: string | null; consultation_date: string }>();
  if (ids.length) {
    const { data: rows } = await supabase.from("consultations").select("id, patient_name, patient_first_name, consultation_date").in("id", ids);
    rows?.forEach((c) => consultations.set(c.id, c));
  }
  const maxVersion = new Map<string, number>();
  for (const d of data) {
    const k = `${d.consultation_id}:${d.document_type}`;
    maxVersion.set(k, Math.max(maxVersion.get(k) ?? 0, d.version));
  }
  return {
    ok: true,
    data: data.map((d) => {
      const c = consultations.get(d.consultation_id);
      return {
        id: d.id,
        type: d.document_type,
        version: d.version,
        createdAt: d.created_at,
        consultationId: d.consultation_id,
        patient: patientLabel(c),
        consultationDate: c?.consultation_date ?? null,
        latest: maxVersion.get(`${d.consultation_id}:${d.document_type}`) === d.version,
      };
    }),
  };
}
