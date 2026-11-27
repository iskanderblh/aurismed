/**
 * Analyse au fil de la consultation : transforme la réponse validée du modèle
 * en propositions rattachées aux répliques de la transcription en direct.
 * La fusion dans la fiche est faite par applyProposals (src/lib/medical/reconcile.ts),
 * qui ne modifie jamais un champ déjà rempli.
 */
import { FIELD_BY_PATH } from "@/lib/medical/catalog";
import { normalizeValue } from "@/lib/medical/form-state";
import { normalizeForMatch } from "@/lib/medical/quotes";
import type { FieldProposal, ProposalSet } from "@/lib/medical/reconcile";
import { quoteInTranscript } from "./process";
import type { PromptSegment } from "./prompt";
import type { AiOutput } from "./schema";

/** Retrouve la réplique qui contient la citation : celle indiquée par le modèle d'abord, puis les autres. */
export function locateQuote(quote: string, hint: number | null | undefined, segments: PromptSegment[]) {
  const normalized = segments.map((s) => ({ s, n: normalizeForMatch(s.text) }));
  const ordered = [...normalized.filter((x) => x.s.seq === hint), ...normalized.filter((x) => x.s.seq !== hint)];
  return ordered.find((x) => quoteInTranscript(quote, x.n))?.s ?? null;
}

export function buildProposals(output: AiOutput, segments: PromptSegment[], options: { full: boolean }): ProposalSet {
  const contradictionPaths = new Set(output.contradictions.flatMap((c) => c.paths));
  const all = normalizeForMatch(segments.map((s) => s.text).join(" "));
  const fields: FieldProposal[] = [];
  const discarded: ProposalSet["discarded"] = [];

  for (const item of output.fields) {
    const def = FIELD_BY_PATH.get(item.path);
    if (!def || def.ai === false) continue;
    const normalized = normalizeValue(def, item.value);
    if (!normalized.ok) {
      discarded.push({ path: item.path, value: item.value, reason: normalized.reason });
      continue;
    }
    const notes: string[] = [];
    let needsCheck = item.confidence !== "high";
    // Citation retrouvée dans une seule réplique, sinon dans l'ensemble (citation à cheval sur deux répliques).
    const segment = locateQuote(item.source_quote, item.segment, segments);
    if (!segment && !quoteInTranscript(item.source_quote, all)) {
      notes.push("Citation introuvable dans la transcription : à vérifier.");
      needsCheck = true;
    }
    if (def.requiresMeasurement && item.kind !== "measured") {
      notes.push("Valeur non indiquée comme mesurée.");
      needsCheck = true;
    }
    if (contradictionPaths.has(item.path)) {
      notes.push("Informations contradictoires dans la transcription.");
      needsCheck = true;
    }
    if (item.note) notes.push(item.note);
    const proposal: FieldProposal = {
      path: item.path,
      value: normalized.value,
      confidence: notes.some((n) => n.startsWith("Citation")) ? "low" : item.confidence,
      // Interlocuteur connu de la réplique (vérifié ou proposé) plutôt que la supposition du modèle.
      speaker: segment && segment.speaker !== "unknown" ? segment.speaker : item.speaker,
      kind: item.kind,
      source: item.source_quote,
      needsCheck,
    };
    if (notes.length) proposal.notes = notes;
    if (segment) {
      proposal.sourceSeq = segment.seq;
      proposal.sourceAt = segment.startMs;
    }
    fields.push(proposal);
  }

  const medications = output.medications.map((m) => {
    const notes: string[] = [];
    if (!locateQuote(m.source_quote, m.segment, segments) && !quoteInTranscript(m.source_quote, all)) {
      notes.push("Citation introuvable dans la transcription : à vérifier.");
    }
    if (!m.dosage || !m.posology || m.duration_days === null) notes.push("Dosage, posologie ou durée non précisés par le médecin.");
    return {
      name: m.name,
      dosage: m.dosage ?? "",
      posology: m.posology ?? "",
      durationDays: m.duration_days === null ? null : Math.round(m.duration_days),
      indication: m.indication ?? "",
      source: m.source_quote,
      confidence: notes.length ? ("low" as const) : m.confidence,
      notes: notes.length ? notes : undefined,
    };
  });

  return {
    fields,
    medications,
    contradictions: output.contradictions.map((c) => ({ paths: c.paths, description: c.description, quotes: c.quotes })),
    missing: options.full ? output.missing_important : undefined,
    discarded,
  };
}
