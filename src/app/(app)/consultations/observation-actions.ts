"use server";

import { createClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/data/consultations";
import { syncConsultationStatus } from "@/lib/data/consultation-status";
import { formDataSchema, pendingReview, type ObservationFormData } from "@/lib/medical/form-state";
import type { Json, ObservationValidationStatus } from "@/types/database";

type Fail = { ok: false; error: string };
type Saved = { ok: true; savedAt: string; validationStatus: ObservationValidationStatus };

async function ctx(consultationId: string) {
  if (!UUID_RE.test(consultationId)) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  return { supabase, user: auth.user };
}

/**
 * Enregistre la fiche (brouillon). Toute modification d'une fiche validée la
 * repasse « en vérification » : la validation porte sur un contenu précis.
 */
export async function saveObservationForm(consultationId: string, form: ObservationFormData): Promise<Saved | Fail> {
  const c = await ctx(consultationId);
  if (!c) return { ok: false, error: "Session expirée ou consultation introuvable." };
  const parsed = formDataSchema.safeParse(form);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Fiche invalide." };

  const { data: existing } = await c.supabase.from("observation_forms").select("id").eq("consultation_id", consultationId).maybeSingle();
  const values = { form_data: parsed.data as unknown as Json, validation_status: "in_review" as const, validated_at: null };
  const { data, error } = existing
    ? await c.supabase.from("observation_forms").update(values).eq("id", existing.id).select("updated_at, validation_status").single()
    : await c.supabase
        .from("observation_forms")
        .insert({ ...values, consultation_id: consultationId, user_id: c.user.id })
        .select("updated_at, validation_status")
        .single();
  if (error || !data) {
    console.error("[fiche] sauvegarde", error?.code, error?.message);
    return { ok: false, error: "La fiche n'a pas pu être enregistrée." };
  }
  await syncConsultationStatus(c.supabase, consultationId);
  return { ok: true, savedAt: data.updated_at, validationStatus: data.validation_status };
}

/** Validation par le médecin : refusée tant qu'une proposition de l'IA n'a pas été revue. */
export async function validateObservationForm(consultationId: string, form: ObservationFormData): Promise<Saved | Fail> {
  const c = await ctx(consultationId);
  if (!c) return { ok: false, error: "Session expirée ou consultation introuvable." };
  const parsed = formDataSchema.safeParse(form);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Fiche invalide." };
  const pending = pendingReview(parsed.data as ObservationFormData);
  if (pending.total > 0) return { ok: false, error: `${pending.total} proposition(s) de l'IA restent à accepter, modifier ou rejeter.` };

  const now = new Date().toISOString();
  const { data, error } = await c.supabase
    .from("observation_forms")
    .update({ form_data: parsed.data as unknown as Json, validation_status: "validated", validated_at: now })
    .eq("consultation_id", consultationId)
    .select("id, updated_at, validation_status")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "La validation n'a pas pu être enregistrée." };
  await c.supabase.from("audit_logs").insert({
    user_id: c.user.id,
    consultation_id: consultationId,
    action: "observation.validated",
    entity_type: "observation_form",
    entity_id: data.id,
  });
  await syncConsultationStatus(c.supabase, consultationId);
  return { ok: true, savedAt: data.updated_at, validationStatus: data.validation_status };
}
