/**
 * Fusion des propositions de l'IA dans la fiche, au fil de la consultation.
 *
 * Règles (identiques côté navigateur et côté serveur) :
 * - un champ vide reçoit la proposition (statut « Information extraite » ou
 *   « À vérifier ») avec sa citation et le morceau de transcription d'origine ;
 * - un champ déjà rempli n'est JAMAIS modifié automatiquement : une valeur
 *   différente est ajoutée comme contradiction à trancher par le médecin, et un
 *   champ proposé par l'IA repasse « À vérifier » ;
 * - un champ réservé au médecin n'est jamais touché ;
 * - une proposition que le médecin a rejetée n'est pas reproposée.
 */
import { FIELD_BY_PATH } from "./catalog";
import {
  isEmptyValue,
  type Confidence,
  type Contradiction,
  type FieldConflict,
  type FieldState,
  type FieldValue,
  type InfoKind,
  type MedicationLine,
  type MissingItem,
  type ObservationFormData,
  type Speaker,
} from "./form-state";
import { normalizeForMatch } from "./quotes";

export type FieldProposal = {
  path: string;
  value: FieldValue;
  confidence: Confidence;
  speaker: Speaker;
  kind: InfoKind;
  source: string;
  sourceSeq?: number;
  sourceAt?: number;
  needsCheck: boolean;
  notes?: string[];
};

export type ProposalSet = {
  fields: FieldProposal[];
  medications: Omit<MedicationLine, "id" | "origin" | "status">[];
  contradictions: Contradiction[];
  /** Renseigné seulement par une réanalyse de toute la consultation. */
  missing?: MissingItem[];
  discarded: { path: string; value: string; reason: string }[];
};

export const sameValue = (a: FieldValue | null | undefined, b: FieldValue | null | undefined) =>
  JSON.stringify(Array.isArray(a) ? [...a].sort() : a) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b);

const AI_STATUSES = new Set(["extracted", "needs_verification"]);
const MAX_CONFLICTS = 10;

function withConflict(state: FieldState, p: FieldProposal): FieldState | null {
  const conflicts = state.conflicts ?? [];
  if (conflicts.some((c) => sameValue(c.value, p.value))) return null;
  const conflict: FieldConflict = { value: p.value, source: p.source, speaker: p.speaker };
  if (p.sourceSeq !== undefined) conflict.sourceSeq = p.sourceSeq;
  if (p.sourceAt !== undefined) conflict.sourceAt = p.sourceAt;
  return {
    ...state,
    status: AI_STATUSES.has(state.status) ? "needs_verification" : state.status,
    conflicts: [...conflicts, conflict].slice(-MAX_CONFLICTS),
  };
}

export type MergeReport = { filled: string[]; conflicts: string[]; medications: number };

export function applyProposals(
  form: ObservationFormData,
  set: ProposalSet,
  meta: { now?: Date; idPrefix?: string } = {},
): { form: ObservationFormData; report: MergeReport } {
  const fields = { ...form.fields };
  const report: MergeReport = { filled: [], conflicts: [], medications: 0 };

  for (const p of set.fields) {
    const def = FIELD_BY_PATH.get(p.path);
    if (!def || def.ai === false) continue;
    const before = fields[p.path];
    const empty = !before || before.status === "not_mentioned" || (isEmptyValue(before.value) && !before.rejected);

    if (empty) {
      const state: FieldState = {
        value: p.value,
        aiValue: p.value,
        status: p.needsCheck ? "needs_verification" : "extracted",
        confidence: p.confidence,
        source: p.source,
        speaker: p.speaker,
        kind: p.kind,
      };
      if (p.notes?.length) state.notes = p.notes;
      if (p.sourceSeq !== undefined) state.sourceSeq = p.sourceSeq;
      if (p.sourceAt !== undefined) state.sourceAt = p.sourceAt;
      // Un champ manuel vidé par le médecin garde sa trace : il reste « manuel » et la proposition devient une contradiction.
      if (before && before.status === "manual") {
        const next = withConflict(before, p);
        if (next) {
          fields[p.path] = next;
          report.conflicts.push(p.path);
        }
        continue;
      }
      fields[p.path] = state;
      report.filled.push(p.path);
      continue;
    }

    // Proposition déjà vue par le médecin (rejetée, ou remplacée par sa propre valeur) : on ne la repropose pas.
    if ((before.rejected || !AI_STATUSES.has(before.status)) && sameValue(before.aiValue, p.value)) continue;
    if (sameValue(before.value, p.value)) {
      // Même valeur : on complète seulement la provenance d'une proposition de l'IA.
      if (AI_STATUSES.has(before.status) && before.sourceSeq === undefined && p.sourceSeq !== undefined) {
        fields[p.path] = { ...before, sourceSeq: p.sourceSeq, sourceAt: p.sourceAt };
      }
      continue;
    }
    const next = withConflict(before, p);
    if (next) {
      fields[p.path] = next;
      report.conflicts.push(p.path);
    }
  }

  // Médicaments : ajoutés comme propositions s'ils ne figurent pas déjà (quel que soit leur statut).
  const known = new Set(form.medications.map((m) => normalizeForMatch(m.name)));
  const stamp = (meta.now ?? new Date()).getTime();
  const meds: MedicationLine[] = [];
  set.medications.forEach((m, i) => {
    const key = normalizeForMatch(m.name);
    if (!key || known.has(key)) return;
    known.add(key);
    meds.push({ ...m, id: `${meta.idPrefix ?? "ai"}-${stamp}-${i}`, origin: "ai", status: "proposed" });
  });
  report.medications = meds.length;

  const seen = new Set(form.contradictions.map((c) => normalizeForMatch(c.description)));
  const contradictions = [...form.contradictions];
  for (const c of set.contradictions) {
    const key = normalizeForMatch(c.description);
    if (seen.has(key)) continue;
    seen.add(key);
    contradictions.push(c);
  }

  const next: ObservationFormData = {
    ...form,
    fields,
    medications: [...form.medications, ...meds].slice(0, 50),
    contradictions: contradictions.slice(-50),
    discarded: [...form.discarded, ...set.discarded].slice(-200),
  };
  if (set.missing) next.missing = set.missing.filter((m) => isEmptyValue(fields[m.path]?.value));
  return { form: next, report };
}

/** Le médecin retient une valeur signalée comme contradictoire : elle devient sa valeur, confirmée. */
export function resolveConflict(state: FieldState, index: number, keep: "new" | "current"): FieldState {
  const conflict = state.conflicts?.[index];
  if (!conflict) return state;
  const rest = state.conflicts!.filter((_, i) => i !== index);
  const base: FieldState = { ...state, conflicts: rest.length ? rest : undefined };
  if (keep === "current") return base;
  return {
    ...base,
    value: conflict.value,
    status: "confirmed",
    source: conflict.source,
    sourceSeq: conflict.sourceSeq,
    sourceAt: conflict.sourceAt,
    speaker: conflict.speaker,
    aiValue: conflict.value,
    notes: undefined,
    rejected: undefined,
  };
}
