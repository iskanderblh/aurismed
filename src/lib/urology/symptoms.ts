/**
 * Fusion des symptômes proposés par l'IA dans la fiche (mêmes règles que les
 * champs, src/lib/medical/reconcile.ts) :
 * - symptôme non documenté → ajouté (« Information extraite » ou « À vérifier ») ;
 * - symptôme déjà documenté → jamais modifié : une présence différente ou une
 *   caractéristique différente devient une contradiction à trancher ; une
 *   caractéristique encore vide d'une proposition de l'IA est complétée ;
 * - symptôme rejeté par le médecin → pas reproposé.
 */
import type { Confidence, InfoKind, Speaker, SymptomAttrs, SymptomConflict, SymptomPresence, SymptomState } from "@/lib/medical/form-state";

export type SymptomProposal = {
  id: string;
  presence: SymptomPresence;
  attrs: SymptomAttrs;
  expression: string;
  confidence: Confidence;
  speaker: Speaker;
  kind: InfoKind;
  source: string;
  sourceSeq?: number;
  sourceAt?: number;
  needsCheck: boolean;
  notes?: string[];
};

const AI = new Set(["extracted", "needs_verification"]);
const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export const PRESENCE_LABEL: Record<SymptomPresence, string> = { yes: "Présent", no: "Absent", uncertain: "Incertain" };

export function applySymptomProposals(
  current: Record<string, SymptomState>,
  proposals: SymptomProposal[],
): { symptoms: Record<string, SymptomState>; filled: string[]; conflicts: string[] } {
  const symptoms = { ...current };
  const filled: string[] = [];
  const conflicts: string[] = [];

  for (const p of proposals) {
    const before = symptoms[p.id];
    if (!before) {
      const state: SymptomState = {
        presence: p.presence,
        status: p.needsCheck ? "needs_verification" : "extracted",
        attrs: p.attrs,
        expression: p.expression,
        confidence: p.confidence,
        source: p.source,
        speaker: p.speaker,
        kind: p.kind,
        aiPresence: p.presence,
      };
      if (p.notes?.length) state.notes = p.notes;
      if (p.sourceSeq !== undefined) state.sourceSeq = p.sourceSeq;
      if (p.sourceAt !== undefined) state.sourceAt = p.sourceAt;
      symptoms[p.id] = state;
      filled.push(p.id);
      continue;
    }
    // Déjà vu par le médecin (rejeté, ou remplacé par sa propre valeur) : pas reproposé.
    if ((before.rejected || !AI.has(before.status)) && before.aiPresence === p.presence && !differs(before.attrs, p.attrs).length) continue;

    const conflict: SymptomConflict = { source: p.source, speaker: p.speaker };
    if (p.sourceSeq !== undefined) conflict.sourceSeq = p.sourceSeq;
    if (p.sourceAt !== undefined) conflict.sourceAt = p.sourceAt;
    if (before.presence !== p.presence) conflict.presence = p.presence;
    const changed = differs(before.attrs, p.attrs);
    if (changed.length) conflict.attrs = Object.fromEntries(changed.map((k) => [k, p.attrs[k]!]));

    // Caractéristiques nouvelles (encore vides) d'une proposition de l'IA, même présence : complétées.
    let next = before;
    if (AI.has(before.status) && before.presence === p.presence) {
      const added = Object.fromEntries(Object.entries(p.attrs).filter(([k, v]) => v && !before.attrs[k as keyof SymptomAttrs]));
      if (Object.keys(added).length) {
        next = { ...before, attrs: { ...before.attrs, ...added } };
        if (before.sourceSeq === undefined && p.sourceSeq !== undefined) next = { ...next, sourceSeq: p.sourceSeq, sourceAt: p.sourceAt };
        filled.push(p.id);
      }
    }
    if (conflict.presence || conflict.attrs) {
      const list = next.conflicts ?? [];
      const dup = list.some((c) => c.presence === conflict.presence && JSON.stringify(c.attrs ?? {}) === JSON.stringify(conflict.attrs ?? {}));
      if (!dup) {
        next = { ...next, status: AI.has(next.status) ? "needs_verification" : next.status, conflicts: [...list, conflict].slice(-10) };
        conflicts.push(p.id);
      }
    }
    symptoms[p.id] = next;
  }
  return { symptoms, filled: [...new Set(filled)], conflicts };
}

/** Caractéristiques renseignées des deux côtés mais différentes. */
function differs(a: SymptomAttrs, b: SymptomAttrs) {
  return (Object.keys(b) as (keyof SymptomAttrs)[]).filter((k) => a[k] && b[k] && norm(a[k]!) !== norm(b[k]!));
}

/** Le médecin tranche une contradiction : il retient la nouvelle information (confirmée) ou garde l'actuelle. */
export function resolveSymptomConflict(state: SymptomState, index: number, keep: "new" | "current"): SymptomState {
  const c = state.conflicts?.[index];
  if (!c) return state;
  const rest = state.conflicts!.filter((_, i) => i !== index);
  const base: SymptomState = { ...state, conflicts: rest.length ? rest : undefined };
  if (keep === "current") return base;
  return {
    ...base,
    presence: c.presence ?? state.presence,
    aiPresence: c.presence ?? state.aiPresence,
    attrs: { ...state.attrs, ...(c.attrs ?? {}) },
    status: "confirmed",
    source: c.source,
    sourceSeq: c.sourceSeq,
    sourceAt: c.sourceAt,
    speaker: c.speaker,
    notes: undefined,
  };
}
