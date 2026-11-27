"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/server/db/client";
import { CATEGORIES, SYMPTOM_BY_ID, customCode, type CategoryKey } from "@/lib/urology/taxonomy";

type Result = { ok: true } | { ok: false; error: string };

const synonymsSchema = z.array(z.string().trim().min(2).max(80)).max(30);
const categoryKeys = CATEGORIES.map((c) => c.key) as [CategoryKey, ...CategoryKey[]];

const newTermSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court").max(80),
  category: z.enum(categoryKeys),
  synonyms: synonymsSchema,
  description: z.string().trim().max(500),
});

async function session() {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  return data.user ? { db, userId: data.user.id } : null;
}

const clean = (list: string[]) => [...new Set(list.map((s) => s.trim()).filter(Boolean))];

/** Ajoute un terme à la taxonomie du médecin (il ne remplace aucun terme intégré). */
export async function addUrologyTerm(input: z.input<typeof newTermSchema>): Promise<Result> {
  const parsed = newTermSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Saisie invalide." };
  const s = await session();
  if (!s) return { ok: false, error: "Session expirée. Reconnectez-vous." };
  const code = customCode(parsed.data.name);
  if (code.length < 9) return { ok: false, error: "Nom invalide." };
  const { data: existing } = await s.db.from("urology_terms").select("id").eq("code", code).maybeSingle();
  if (existing) return { ok: false, error: "Ce terme existe déjà dans votre liste." };
  const { error } = await s.db.from("urology_terms").insert({
    user_id: s.userId,
    code,
    name: parsed.data.name,
    category: parsed.data.category,
    synonyms: clean(parsed.data.synonyms),
    description: parsed.data.description,
  });
  if (error) return { ok: false, error: "L'enregistrement a échoué. Réessayez." };
  await s.db.from("audit_logs").insert({ user_id: s.userId, action: "urology_term.added", entity_type: "urology_term", entity_id: code });
  revalidatePath("/parametres");
  return { ok: true };
}

/** Ajoute des synonymes (expressions de patients) à un terme intégré ou ajouté. */
export async function addUrologySynonyms(code: string, synonyms: string[]): Promise<Result> {
  const parsed = z.object({ code: z.string().regex(/^[a-z0-9_]{2,60}$/), synonyms: synonymsSchema.min(1) }).safeParse({ code, synonyms });
  if (!parsed.success) return { ok: false, error: "Synonyme invalide (2 à 80 caractères)." };
  const s = await session();
  if (!s) return { ok: false, error: "Session expirée. Reconnectez-vous." };
  const { data: row } = await s.db.from("urology_terms").select("id, synonyms").eq("code", parsed.data.code).maybeSingle();
  const now = new Date().toISOString();
  if (row) {
    const current = Array.isArray(row.synonyms) ? row.synonyms.filter((x): x is string => typeof x === "string") : [];
    const { error } = await s.db
      .from("urology_terms")
      .update({ synonyms: clean([...current, ...parsed.data.synonyms]), updated_at: now })
      .eq("id", row.id);
    if (error) return { ok: false, error: "L'enregistrement a échoué. Réessayez." };
  } else {
    const builtin = SYMPTOM_BY_ID.get(parsed.data.code);
    if (!builtin) return { ok: false, error: "Terme introuvable." };
    const { error } = await s.db.from("urology_terms").insert({
      user_id: s.userId,
      code: builtin.id,
      name: builtin.name,
      category: builtin.category,
      synonyms: clean(parsed.data.synonyms),
      description: "",
    });
    if (error) return { ok: false, error: "L'enregistrement a échoué. Réessayez." };
  }
  await s.db.from("audit_logs").insert({ user_id: s.userId, action: "urology_term.synonyms_added", entity_type: "urology_term", entity_id: parsed.data.code });
  revalidatePath("/parametres");
  return { ok: true };
}

/** Retire un terme ajouté, ou les synonymes ajoutés à un terme intégré (le terme intégré reste). */
export async function removeUrologyTerm(code: string): Promise<Result> {
  if (!/^[a-z0-9_]{2,60}$/.test(code)) return { ok: false, error: "Terme invalide." };
  const s = await session();
  if (!s) return { ok: false, error: "Session expirée. Reconnectez-vous." };
  const { error } = await s.db.from("urology_terms").delete().eq("code", code);
  if (error) return { ok: false, error: "La suppression a échoué. Réessayez." };
  await s.db.from("audit_logs").insert({ user_id: s.userId, action: "urology_term.removed", entity_type: "urology_term", entity_id: code });
  revalidatePath("/parametres");
  return { ok: true };
}
