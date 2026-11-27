import { FIELD_BY_PATH, FIELDS, isMaritimeField, type FieldDef } from "@/lib/medical/catalog";
import { applySymptomProposals } from "@/lib/urology/symptoms";
import { SYMPTOMS, type SymptomDef } from "@/lib/urology/taxonomy";
import { buildSymptomProposals } from "./symptoms";
import {
  emptyFormData,
  isEmptyValue,
  normalizeValue,
  type FieldState,
  type FieldValue,
  type MedicationLine,
  type ObservationFormData,
} from "@/lib/medical/form-state";
import { normalizeForMatch } from "@/lib/medical/quotes";
import type { AiOutput } from "./schema";

export { normalizeForMatch };

/** Vérifie que la citation figure dans la transcription (morceaux séparés par « … » acceptés). */
export function quoteInTranscript(quote: string, normalizedTranscript: string) {
  const pieces = quote
    .split(/\.\.\.|…/)
    .map(normalizeForMatch)
    .filter((p) => p.length > 0);
  return pieces.length > 0 && pieces.every((p) => normalizedTranscript.includes(p));
}

/**
 * Règles propres au champ : contexte maritime désactivé (champ ignoré) et
 * constatations d'examen clinique (seulement énoncées par le médecin, toujours
 * à confirmer par lui).
 */
export function fieldRule(
  def: FieldDef,
  item: { speaker: string; kind: string },
  options: { maritime?: boolean },
): { skip: true } | { skip: false; discard?: string; needsCheck: boolean; notes: string[] } {
  if (options.maritime === false && isMaritimeField(def)) return { skip: true };
  if (def.clinicalExam) {
    if (item.speaker !== "doctor" || (item.kind !== "observed" && item.kind !== "measured")) {
      return { skip: false, discard: "constatation d'examen non énoncée par le médecin", needsCheck: true, notes: [] };
    }
    return { skip: false, needsCheck: true, notes: ["Constatation d'examen : à confirmer par le médecin."] };
  }
  return { skip: false, needsCheck: false, notes: [] };
}

const sameValue = (a: FieldValue | null | undefined, b: FieldValue | null | undefined) =>
  JSON.stringify(Array.isArray(a) ? [...a].sort() : a) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b);

/**
 * Transforme la réponse validée de l'IA en état de fiche, puis la fusionne avec
 * la fiche existante :
 *  - un champ saisi ou confirmé par le médecin n'est jamais remplacé ;
 *  - une valeur sans citation retrouvée dans la transcription, une constante non
 *    mesurée, une confiance moyenne ou faible, ou une contradiction : « à vérifier » ;
 *  - une valeur incompatible avec le champ est écartée et listée dans `discarded`.
 */
export function processExtraction(
  output: AiOutput,
  transcript: string,
  previous: ObservationFormData | null,
  meta: { model: string; now?: Date; maritime?: boolean; taxonomy?: SymptomDef[] } = { model: "unknown" },
): ObservationFormData {
  const prev = previous ?? emptyFormData();
  const normalizedTranscript = normalizeForMatch(transcript);
  const result: ObservationFormData = {
    ...emptyFormData(),
    // Saisies exclusivement médicales : reprises telles quelles.
    followUps: prev.followUps ?? [],
    careChart: prev.careChart ?? { columns: [], cells: {} },
    bodyMarks: prev.bodyMarks ?? [],
    extractedAt: (meta.now ?? new Date()).toISOString(),
    model: meta.model,
  };

  const contradictionPaths = new Set(output.contradictions.flatMap((c) => c.paths));
  const proposed = new Map<string, FieldState>();

  for (const item of output.fields) {
    const field = FIELD_BY_PATH.get(item.path);
    if (!field || field.ai === false) continue;
    const rule = fieldRule(field, item, meta);
    if (rule.skip) continue;
    if (rule.discard) {
      result.discarded.push({ path: item.path, value: item.value, reason: rule.discard });
      continue;
    }
    const normalized = normalizeValue(field, item.value);
    if (!normalized.ok) {
      result.discarded.push({ path: item.path, value: item.value, reason: normalized.reason });
      continue;
    }
    const notes: string[] = [...rule.notes];
    let needsCheck = item.confidence !== "high" || rule.needsCheck;
    if (!quoteInTranscript(item.source_quote, normalizedTranscript)) {
      notes.push("Citation introuvable dans la transcription : à vérifier.");
      needsCheck = true;
    }
    if (field.requiresMeasurement && item.kind !== "measured") {
      notes.push("Valeur non indiquée comme mesurée.");
      needsCheck = true;
    }
    if (contradictionPaths.has(item.path)) {
      notes.push("Informations contradictoires dans la transcription.");
      needsCheck = true;
    }
    if (item.note) notes.push(item.note);

    const existing = proposed.get(item.path);
    if (existing) {
      // Même champ cité deux fois : on garde la première valeur et on signale l'écart.
      if (!sameValue(existing.value, normalized.value)) {
        existing.status = "needs_verification";
        existing.confidence = "low";
        existing.notes = [...(existing.notes ?? []), `Autre valeur mentionnée : ${item.value} (« ${item.source_quote} »).`];
      }
      continue;
    }
    proposed.set(item.path, {
      value: normalized.value,
      aiValue: normalized.value,
      status: needsCheck ? "needs_verification" : "extracted",
      confidence: notes.some((n) => n.startsWith("Citation")) ? "low" : item.confidence,
      source: item.source_quote,
      speaker: item.speaker,
      kind: item.kind,
      notes: notes.length ? notes : undefined,
    });
  }

  for (const field of FIELDS) {
    const before = prev.fields[field.path];
    const ai = proposed.get(field.path);
    // Sans contexte maritime, ces champs ne sont pas analysés : leur état antérieur est conservé tel quel.
    if (meta.maritime === false && isMaritimeField(field)) {
      if (before) result.fields[field.path] = before;
      continue;
    }
    if (field.ai === false || before?.status === "manual" || before?.status === "confirmed") {
      // Le médecin garde la main : la nouvelle proposition est seulement mémorisée.
      if (before) {
        let kept: FieldState = ai && field.ai !== false ? { ...before, aiValue: ai.value } : before;
        // Valeur du médecin contredite par la transcription : signalée, jamais remplacée.
        if (ai && field.ai !== false && !isEmptyValue(before.value) && !sameValue(before.value, ai.value) && !sameValue(before.aiValue, ai.value) && !(before.conflicts ?? []).some((c) => sameValue(c.value, ai.value))) {
          kept = { ...kept, conflicts: [...(before.conflicts ?? []), { value: ai.value!, source: ai.source ?? "", speaker: ai.speaker }].slice(-10) };
        }
        result.fields[field.path] = kept;
      }
      continue;
    }
    const hadProposal = before && (before.status === "extracted" || before.status === "needs_verification") && !isEmptyValue(before.value);
    if (hadProposal && !ai) {
      // Proposition antérieure (par exemple de l'analyse au fil de la consultation) non retrouvée : conservée, à vérifier.
      result.fields[field.path] = {
        ...before,
        status: "needs_verification",
        notes: [...(before.notes ?? []).filter((n) => !n.startsWith("Non retrouvée")), "Non retrouvée par la dernière analyse : à vérifier."],
      };
      continue;
    }
    if (hadProposal && ai && !sameValue(before.value, ai.value)) {
      // Jamais de remplacement silencieux : la nouvelle valeur est signalée.
      result.fields[field.path] = {
        ...ai,
        status: "needs_verification",
        notes: [...(ai.notes ?? []), `Valeur proposée auparavant : ${String(before.value)} (« ${before.source ?? ""} »).`],
      };
      continue;
    }
    if (hadProposal && ai && before.sourceSeq !== undefined) {
      result.fields[field.path] = { ...ai, sourceSeq: before.sourceSeq, sourceAt: before.sourceAt };
      continue;
    }
    result.fields[field.path] = ai ?? { value: null, status: "not_mentioned" };
  }

  // Médicaments : on garde ceux du médecin (acceptés, saisis ou rejetés) et on remplace les propositions.
  const kept = prev.medications.filter((m) => m.origin === "manual" || m.status !== "proposed");
  const keptNames = new Set(kept.map((m) => normalizeForMatch(m.name)));
  const meds: MedicationLine[] = output.medications
    .filter((m) => !keptNames.has(normalizeForMatch(m.name)))
    .map((m, i) => {
      const notes: string[] = [];
      if (!quoteInTranscript(m.source_quote, normalizedTranscript)) notes.push("Citation introuvable dans la transcription : à vérifier.");
      if (!m.dosage || !m.posology || m.duration_days === null) notes.push("Dosage, posologie ou durée non précisés par le médecin.");
      return {
        id: `ai-${(meta.now ?? new Date()).getTime()}-${i}`,
        name: m.name,
        dosage: m.dosage ?? "",
        posology: m.posology ?? "",
        durationDays: m.duration_days === null ? null : Math.round(m.duration_days),
        indication: m.indication ?? "",
        origin: "ai" as const,
        status: "proposed" as const,
        source: m.source_quote,
        confidence: notes.length ? "low" : m.confidence,
        notes: notes.length ? notes : undefined,
      };
    });
  result.medications = [...kept, ...meds];
  // Symptômes : jamais retirés ni remplacés en silence (mêmes règles qu'au fil de la consultation).
  const built = buildSymptomProposals(
    output.symptoms,
    (quote) => ({ found: quoteInTranscript(quote, normalizedTranscript) }),
    meta.taxonomy ?? SYMPTOMS,
  );
  result.symptoms = applySymptomProposals(prev.symptoms ?? {}, built.proposals).symptoms;
  result.discarded.push(...built.discarded);
  if (prev.maritime !== undefined) result.maritime = prev.maritime;
  if (prev.alertsReviewed) result.alertsReviewed = prev.alertsReviewed;
  if (prev.live) result.live = prev.live;
  result.contradictions = output.contradictions.map((c) => ({ paths: c.paths, description: c.description, quotes: c.quotes }));
  result.missing = output.missing_important.filter((m) => !proposed.has(m.path));
  return result;
}
