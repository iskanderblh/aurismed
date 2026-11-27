import "server-only";
import { createClient } from "@/server/db/client";
import type { ConsultationStatus, DocumentType } from "@/types/database";

export type DashboardData = {
  totalConsultations: number;
  totalDocuments: number;
  recentConsultations: {
    id: string;
    patient_name: string | null;
    patient_first_name: string | null;
    consultation_date: string;
    status: ConsultationStatus;
  }[];
  recentDocuments: {
    id: string;
    document_type: DocumentType;
    created_at: string;
    consultation_id: string;
    consultations: { patient_name: string | null; patient_first_name: string | null } | null;
  }[];
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Les requêtes passent par la RLS : seules les données du médecin connecté sont lues. */
export async function getDashboardData(): Promise<Result<DashboardData>> {
  const db = await createClient();
  const [consultCount, docCount, recentConsultations, recentDocuments] = await Promise.all([
    db.from("consultations").select("id", { count: "exact", head: true }),
    db.from("generated_documents").select("id", { count: "exact", head: true }),
    db
      .from("consultations")
      .select("id, patient_name, patient_first_name, consultation_date, status")
      .order("consultation_date", { ascending: false })
      .limit(5),
    db
      .from("generated_documents")
      .select("id, document_type, created_at, consultation_id")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const failed = [consultCount, docCount, recentConsultations, recentDocuments].find((r) => r.error);
  if (failed?.error) {
    console.error("[dashboard] échec de lecture", failed.error.code, failed.error.message);
    return { ok: false, error: "Impossible de joindre la base de données." };
  }

  // Noms des patients des documents récents (requête séparée pour rester simple et typée).
  const docs = recentDocuments.data ?? [];
  const ids = [...new Set(docs.map((d) => d.consultation_id))];
  const patients = new Map<string, { patient_name: string | null; patient_first_name: string | null }>();
  if (ids.length) {
    const { data } = await db
      .from("consultations")
      .select("id, patient_name, patient_first_name")
      .in("id", ids);
    data?.forEach((c) => patients.set(c.id, c));
  }

  return {
    ok: true,
    data: {
      totalConsultations: consultCount.count ?? 0,
      totalDocuments: docCount.count ?? 0,
      recentConsultations: recentConsultations.data ?? [],
      recentDocuments: docs.map((d) => ({ ...d, consultations: patients.get(d.consultation_id) ?? null })),
    },
  };
}
