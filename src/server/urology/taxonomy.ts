import "server-only";
import type { DbClient } from "@/server/db/client";
import { buildTaxonomy, CATEGORIES, type CategoryKey, type CustomTerm, type SymptomDef } from "@/lib/urology/taxonomy";

/** Taxonomie du médecin : base intégrée + ses termes et synonymes (table urology_terms). */
export async function loadTaxonomy(db: DbClient): Promise<{ taxonomy: SymptomDef[]; custom: CustomTerm[] }> {
  const { data } = await db.from("urology_terms").select("code, name, category, synonyms, description").order("created_at");
  const keys = new Set(CATEGORIES.map((c) => c.key));
  const custom: CustomTerm[] = (data ?? []).map((r) => ({
    code: r.code,
    name: r.name,
    category: (keys.has(r.category as CategoryKey) ? r.category : "custom") as CategoryKey,
    synonyms: Array.isArray(r.synonyms) ? r.synonyms.filter((x): x is string => typeof x === "string") : [],
    description: r.description,
  }));
  return { taxonomy: buildTaxonomy(custom), custom };
}
