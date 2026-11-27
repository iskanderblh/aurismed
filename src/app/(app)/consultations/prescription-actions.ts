"use server";

import { createClient } from "@/server/db/client";
import { UUID_RE } from "@/lib/data/consultations";
import { syncConsultationStatus } from "@/lib/data/consultation-status";
import { prescriptionIssues, prescriptionSchema, type PrescriptionData } from "@/lib/prescription/schema";
import type { ConsultationStatus, Json } from "@/types/database";

type Fail = { ok: false; error: string };
type Saved = { ok: true; savedAt: string; validationStatus: "draft" | "validated"; consultationStatus: ConsultationStatus | null };

async function ctx(consultationId: string) {
  if (!UUID_RE.test(consultationId)) return null;
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  return { db, user: auth.user };
}

async function write(consultationId: string, data: PrescriptionData, validate: boolean): Promise<Saved | Fail> {
  const c = await ctx(consultationId);
  if (!c) return { ok: false, error: "Session expirée ou consultation introuvable." };
  const parsed = prescriptionSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ordonnance invalide : vérifiez les durées et la longueur des champs." };
  if (validate) {
    const issues = prescriptionIssues(parsed.data);
    if (issues.length) return { ok: false, error: issues.join(" ") };
  }
  const values = {
    prescription_data: parsed.data as unknown as Json,
    validation_status: validate ? ("validated" as const) : ("draft" as const),
    validated_at: validate ? new Date().toISOString() : null,
  };
  const { data: existing } = await c.db.from("prescriptions").select("id").eq("consultation_id", consultationId).maybeSingle();
  const { data: row, error } = existing
    ? await c.db.from("prescriptions").update(values).eq("id", existing.id).select("id, updated_at, validation_status").single()
    : await c.db
        .from("prescriptions")
        .insert({ ...values, consultation_id: consultationId, user_id: c.user.id })
        .select("id, updated_at, validation_status")
        .single();
  if (error || !row) {
    console.error("[ordonnance] sauvegarde", error?.code, error?.message);
    return { ok: false, error: "L'ordonnance n'a pas pu être enregistrée." };
  }
  if (validate) {
    await c.db.from("audit_logs").insert({
      user_id: c.user.id,
      consultation_id: consultationId,
      action: "prescription.validated",
      entity_type: "prescription",
      entity_id: row.id,
      metadata: { lines: parsed.data.noPrescription ? 0 : parsed.data.lines.length },
    });
  }
  const consultationStatus = await syncConsultationStatus(c.db, consultationId);
  return { ok: true, savedAt: row.updated_at, validationStatus: row.validation_status, consultationStatus };
}

/** Brouillon : toute modification d'une ordonnance validée annule la validation. */
export async function savePrescription(consultationId: string, data: PrescriptionData) {
  return write(consultationId, data, false);
}

/** Validation explicite par le médecin (lignes complètes ou « aucun médicament »). */
export async function validatePrescription(consultationId: string, data: PrescriptionData) {
  return write(consultationId, data, true);
}
