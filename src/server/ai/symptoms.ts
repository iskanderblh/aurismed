/**
 * Contrôle des symptômes proposés par le modèle : identifiant connu de la
 * taxonomie, citation retrouvée dans la transcription, caractéristiques
 * propres au symptôme, valeur chiffrée seulement si elle a été mesurée ou
 * énoncée comme résultat.
 */
import { SYMPTOM_ATTRS, type SymptomAttrs } from "@/lib/medical/form-state";
import type { SymptomProposal } from "@/lib/urology/symptoms";
import { SYMPTOMS, type SymptomDef } from "@/lib/urology/taxonomy";
import type { AiOutput } from "./schema";

export function buildSymptomProposals(
  items: AiOutput["symptoms"],
  locate: (quote: string, hint: number | null | undefined) => { found: boolean; seq?: number; at?: number; speaker?: "doctor" | "patient" | "unknown" },
  taxonomy: SymptomDef[] = SYMPTOMS,
): { proposals: SymptomProposal[]; discarded: { path: string; value: string; reason: string }[] } {
  const byId = new Map(taxonomy.map((x) => [x.id, x]));
  const proposals: SymptomProposal[] = [];
  const discarded: { path: string; value: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const def = byId.get(item.id);
    if (!def) {
      discarded.push({ path: `symptome:${item.id}`, value: item.expression, reason: "symptôme inconnu de la taxonomie" });
      continue;
    }
    // Un même symptôme cité deux fois dans une réponse : la première occurrence est retenue, la suivante sera une contradiction au prochain passage.
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    const notes: string[] = [];
    let needsCheck = item.confidence !== "high" || item.presence === "uncertain";
    const loc = locate(item.source_quote, item.segment);
    if (!loc.found) {
      notes.push("Citation introuvable dans la transcription : à vérifier.");
      needsCheck = true;
    }
    const attrs: SymptomAttrs = {};
    for (const k of SYMPTOM_ATTRS) {
      const v = item[k];
      if (!v || !v.trim()) continue;
      if (k !== "details" && !def.attributes.includes(k)) continue;
      attrs[k] = v.trim().slice(0, 1000);
    }
    // Une valeur chiffrée (fièvre, PSA, diurèse) n'est reprise que mesurée ou énoncée comme résultat.
    if (attrs.value && item.kind !== "measured") {
      notes.push("Valeur non indiquée comme mesurée : à vérifier.");
      needsCheck = true;
    }
    const p: SymptomProposal = {
      id: item.id,
      presence: item.presence,
      attrs,
      expression: item.expression.trim().slice(0, 1000),
      confidence: loc.found ? item.confidence : "low",
      speaker: loc.speaker && loc.speaker !== "unknown" ? loc.speaker : item.speaker,
      kind: item.kind,
      source: item.source_quote,
      needsCheck,
    };
    if (notes.length) p.notes = notes;
    if (loc.seq !== undefined) {
      p.sourceSeq = loc.seq;
      p.sourceAt = loc.at;
    }
    proposals.push(p);
  }
  return { proposals, discarded };
}
