import { FIELD_BY_PATH, FIELDS } from "@/lib/medical/catalog";
import {
  emptyFormData,
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
  meta: { model: string; now?: Date } = { model: "unknown" },
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
    const normalized = normalizeValue(field, item.value);
    if (!normalized.ok) {
      result.discarded.push({ path: item.path, value: item.value, reason: normalized.reason });
      continue;
    }
    const notes: string[] = [];
    let needsCheck = item.confidence !== "high";
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
    if (field.ai === false || before?.status === "manual" || before?.status === "confirmed") {
      // Le médecin garde la main : la nouvelle proposition est seulement mémorisée.
      if (before) result.fields[field.path] = ai && field.ai !== false ? { ...before, aiValue: ai.value } : before;
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
  result.contradictions = output.contradictions.map((c) => ({ paths: c.paths, description: c.description, quotes: c.quotes }));
  result.missing = output.missing_important.filter((m) => !proposed.has(m.path));
  return result;
}
