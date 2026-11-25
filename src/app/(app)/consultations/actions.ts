"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { consultationDraftSchema } from "@/lib/consultation/schema";
import { draftToRow } from "@/lib/consultation/mapping";
import { UUID_RE } from "@/lib/data/consultations";

export type SaveResult =
  | { ok: true; id: string; savedAt: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function flattenIssues(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Crée (id = null) ou met à jour le brouillon d'une consultation.
 * Les données sont validées côté serveur ; la RLS garantit que seule une
 * consultation du médecin connecté peut être modifiée.
 */
export async function saveConsultationDraft(id: string | null, input: unknown): Promise<SaveResult> {
  if (id !== null && !UUID_RE.test(id)) return { ok: false, error: "Consultation introuvable." };

  const parsed = consultationDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Certains champs sont invalides.", fieldErrors: flattenIssues(parsed.error) };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Session expirée. Reconnectez-vous ; vos saisies restent affichées." };

  const row = draftToRow(parsed.data);

  if (id === null) {
    const { data, error } = await supabase
      .from("consultations")
      .insert({ ...row, user_id: auth.user.id })
      .select("id, updated_at")
      .single();
    if (error) {
      console.error("[consultation] création", error.code, error.message);
      return { ok: false, error: "La consultation n'a pas pu être créée." };
    }
    await supabase
      .from("audit_logs")
      .insert({ user_id: auth.user.id, consultation_id: data.id, action: "consultation.created", entity_type: "consultation", entity_id: data.id });
    revalidatePath("/consultations");
    return { ok: true, id: data.id, savedAt: data.updated_at };
  }

  const { data, error } = await supabase
    .from("consultations")
    .update(row)
    .eq("id", id)
    .select("id, updated_at")
    .maybeSingle();
  if (error) {
    console.error("[consultation] sauvegarde", error.code, error.message);
    return { ok: false, error: "La sauvegarde a échoué." };
  }
  if (!data) return { ok: false, error: "Consultation introuvable ou supprimée." };
  return { ok: true, id: data.id, savedAt: data.updated_at };
}

/**
 * Supprime une consultation, ses fichiers (audio, PDF) et, par cascade, toutes ses données.
 */
export async function deleteConsultation(id: string): Promise<{ ok: false; error: string } | never> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Consultation introuvable." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Session expirée. Reconnectez-vous." };

  // Fichiers d'abord : si leur suppression échoue, la consultation est conservée.
  const prefix = `${auth.user.id}/${id}`;
  for (const bucket of ["recordings", "documents"] as const) {
    const { data: files, error: listError } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
    if (listError) {
      console.error("[consultation] liste fichiers", bucket, listError.message);
      return { ok: false, error: "Les fichiers associés n'ont pas pu être vérifiés. Rien n'a été supprimé." };
    }
    if (files?.length) {
      const { error: removeError } = await supabase.storage.from(bucket).remove(files.map((f) => `${prefix}/${f.name}`));
      if (removeError) {
        console.error("[consultation] suppression fichiers", bucket, removeError.message);
        return { ok: false, error: "Les fichiers associés n'ont pas pu être supprimés. Réessayez." };
      }
    }
  }

  const { data, error } = await supabase.from("consultations").delete().eq("id", id).select("id");
  if (error || !data?.length) {
    if (error) console.error("[consultation] suppression", error.code, error.message);
    return { ok: false, error: "La consultation n'a pas pu être supprimée." };
  }
  await supabase
    .from("audit_logs")
    .insert({ user_id: auth.user.id, action: "consultation.deleted", entity_type: "consultation", entity_id: id });

  revalidatePath("/consultations");
  redirect("/consultations?supprimee=1");
}
