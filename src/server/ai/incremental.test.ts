import { describe, expect, it } from "vitest";
import { emptyFormData, formDataSchema, pendingReview } from "@/lib/medical/form-state";
import { applyProposals, resolveConflict } from "@/lib/medical/reconcile";
import { buildProposals, locateQuote } from "./incremental";
import { processExtraction } from "./process";
import { aiOutputSchema, extractionJsonSchema, type AiOutput } from "./schema";
import type { PromptSegment } from "./prompt";

// Consultation synthétique, découpée en répliques comme la transcription en direct.
const segs: PromptSegment[] = [
  { seq: 0, startMs: 1000, speaker: "doctor", text: "Bonjour, qu'est-ce qui vous amène ?" },
  { seq: 1, startMs: 4000, speaker: "patient", text: "J'ai mal au ventre depuis hier soir, surtout en bas à droite." },
  { seq: 2, startMs: 9000, speaker: "unknown", text: "J'ai des nausées mais je n'ai pas vomi." },
  { seq: 3, startMs: 14000, speaker: "doctor", text: "Température mesurée à 38 degrés." },
];
type Item = AiOutput["fields"][number];
const item = (p: Partial<Item> & Pick<Item, "path" | "value" | "source_quote">): Item => ({
  confidence: "high",
  speaker: "unknown",
  kind: "reported",
  note: null,
  segment: null,
  ...p,
});
const out = (fields: Item[], extra: Partial<AiOutput> = {}): AiOutput => ({ fields, symptoms: [], medications: [], contradictions: [], missing_important: [], ...extra });

describe("analyse au fil de la consultation", () => {
  it("rattache chaque valeur à sa réplique, même si le numéro donné par le modèle est faux", () => {
    const set = buildProposals(
      out([
        item({ path: "medical.abdominal.nausea", value: "oui", source_quote: "j'ai des nausées", segment: 2 }),
        item({ path: "medical.abdominal.vomiting", value: "non", source_quote: "je n'ai pas vomi", segment: 0 }),
        item({ path: "medical.general.temperature", value: "38", kind: "measured", source_quote: "Température mesurée à 38 degrés", segment: 3 }),
      ]),
      segs,
      { full: false },
    );
    expect(set.fields.map((f) => [f.path, f.sourceSeq, f.sourceAt])).toEqual([
      ["medical.abdominal.nausea", 2, 9000],
      ["medical.abdominal.vomiting", 2, 9000],
      ["medical.general.temperature", 3, 14000],
    ]);
    // Interlocuteur connu de la réplique plutôt que la supposition du modèle.
    expect(set.fields[2].speaker).toBe("doctor");
    expect(set.fields[0].speaker).toBe("unknown");
    expect(set.missing).toBeUndefined();
  });

  it("met à vérifier une citation introuvable (valeur inventée) et écarte une valeur incompatible", () => {
    const set = buildProposals(
      out([
        item({ path: "vitals.circ.heartRate", value: "120", kind: "measured", source_quote: "pouls à 120" }),
        item({ path: "vitals.circ.systolic", value: "beaucoup", kind: "measured", source_quote: "Température mesurée" }),
      ]),
      segs,
      { full: false },
    );
    expect(set.fields[0]).toMatchObject({ needsCheck: true, confidence: "low" });
    expect(set.fields[0].sourceSeq).toBeUndefined();
    expect(set.discarded.map((d) => d.path)).toEqual(["vitals.circ.systolic"]);
  });

  it("retrouve une citation dans une réplique", () => {
    expect(locateQuote("en bas à droite", 3, segs)?.seq).toBe(1);
    expect(locateQuote("douleur thoracique", null, segs)).toBeNull();
  });

  it("remplit les champs vides, puis signale une contradiction sans changer la valeur", () => {
    const first = applyProposals(
      emptyFormData(),
      buildProposals(out([item({ path: "medical.abdominal.vomiting", value: "non", source_quote: "je n'ai pas vomi" })]), segs, { full: false }),
    );
    expect(first.report.filled).toEqual(["medical.abdominal.vomiting"]);
    expect(first.form.fields["medical.abdominal.vomiting"]).toMatchObject({ value: false, status: "extracted", sourceSeq: 2 });

    const later: PromptSegment[] = [{ seq: 7, startMs: 60000, speaker: "patient", text: "En fait si, j'ai vomi deux fois cette nuit." }];
    const second = applyProposals(
      first.form,
      buildProposals(out([item({ path: "medical.abdominal.vomiting", value: "oui", source_quote: "j'ai vomi deux fois" })]), later, { full: false }),
    );
    const f = second.form.fields["medical.abdominal.vomiting"];
    expect(f.value).toBe(false);
    expect(f.status).toBe("needs_verification");
    expect(f.conflicts).toEqual([{ value: true, source: "j'ai vomi deux fois", speaker: "patient", sourceSeq: 7, sourceAt: 60000 }]);
    expect(second.report.conflicts).toEqual(["medical.abdominal.vomiting"]);
    // La même contradiction n'est pas ajoutée deux fois.
    const third = applyProposals(
      second.form,
      buildProposals(out([item({ path: "medical.abdominal.vomiting", value: "oui", source_quote: "j'ai vomi deux fois" })]), later, { full: false }),
    );
    expect(third.form.fields["medical.abdominal.vomiting"].conflicts).toHaveLength(1);
    expect(formDataSchema.safeParse(third.form).success).toBe(true);

    // Le médecin tranche.
    const kept = resolveConflict(f, 0, "new");
    expect(kept).toMatchObject({ value: true, status: "confirmed", sourceSeq: 7 });
    expect(kept.conflicts).toBeUndefined();
    expect(resolveConflict(f, 0, "current")).toMatchObject({ value: false, status: "needs_verification" });
  });

  it("ne modifie jamais un champ saisi ou validé par le médecin, ni un champ qui lui est réservé", () => {
    const form = emptyFormData();
    form.fields["medical.general.temperature"] = { value: 38.4, status: "manual" };
    form.fields["medical.abdominal.nausea"] = { value: true, status: "confirmed" };
    const set = buildProposals(
      out([
        item({ path: "medical.general.temperature", value: "38", kind: "measured", source_quote: "Température mesurée à 38 degrés" }),
        item({ path: "medical.abdominal.nausea", value: "oui", source_quote: "j'ai des nausées" }),
      ]),
      segs,
      { full: false },
    );
    const { form: next } = applyProposals(form, {
      ...set,
      fields: [...set.fields, { ...set.fields[1], path: "decision.choice", value: "evasan" }],
    });
    expect(next.fields["medical.general.temperature"]).toMatchObject({ value: 38.4, status: "manual" });
    expect(next.fields["medical.general.temperature"].conflicts?.[0].value).toBe(38);
    expect(next.fields["medical.abdominal.nausea"]).toEqual({ value: true, status: "confirmed" });
    expect(next.fields["decision.choice"]).toBeUndefined();
    // Une contradiction non tranchée bloque la validation.
    expect(pendingReview(next).fields).toEqual(["medical.general.temperature"]);
  });

  it("ne signale pas comme contradiction la proposition que le médecin a déjà remplacée", () => {
    const form = emptyFormData();
    form.fields["medical.abdominal.location"] = { value: "Flanc droit", status: "manual", aiValue: "Fosse iliaque droite" };
    const set = buildProposals(out([item({ path: "medical.abdominal.location", value: "Fosse iliaque droite", source_quote: "en bas à droite" })]), segs, { full: true });
    expect(applyProposals(form, set).form.fields["medical.abdominal.location"]).toEqual(form.fields["medical.abdominal.location"]);
  });

  it("ne repropose pas une valeur rejetée et n'ajoute pas un médicament déjà présent", () => {
    const form = emptyFormData();
    form.fields["medical.abdominal.nausea"] = { value: null, status: "manual", rejected: true, aiValue: true };
    form.medications = [
      { id: "m1", name: "Paracétamol", dosage: "1 g", posology: "", durationDays: null, indication: "", origin: "manual", status: "accepted" },
    ];
    const { form: next, report } = applyProposals(form, {
      ...buildProposals(out([item({ path: "medical.abdominal.nausea", value: "oui", source_quote: "j'ai des nausées" })]), segs, { full: false }),
      medications: [{ name: "paracetamol", dosage: "", posology: "", durationDays: null, indication: "", source: "x" }],
    });
    expect(next.fields["medical.abdominal.nausea"]).toEqual(form.fields["medical.abdominal.nausea"]);
    expect(report.medications).toBe(0);
  });

  it("la relecture d'ensemble remplace la liste des informations manquantes", () => {
    const set = buildProposals(out([], { missing_important: [{ path: "vitals.circ.systolic", reason: "douleur abdominale fébrile" }] }), segs, { full: true });
    expect(applyProposals(emptyFormData(), set).form.missing).toEqual([{ path: "vitals.circ.systolic", reason: "douleur abdominale fébrile" }]);
  });

  it("le schéma JSON exige le numéro de réplique seulement en mode direct", () => {
    expect(extractionJsonSchema({ segments: true }).schema.properties.fields.items.required).toContain("segment");
    expect(extractionJsonSchema().schema.properties.fields.items.required).not.toContain("segment");
    expect(aiOutputSchema.safeParse(out([item({ path: "medical.abdominal.nausea", value: "oui", source_quote: "x", segment: 2 })])).success).toBe(true);
  });
});

describe("analyse complète après la transcription confirmée", () => {
  const transcript = segs.map((s) => s.text).join(" ");
  it("ne remplace pas silencieusement une proposition antérieure et garde celle non retrouvée", () => {
    const prev = emptyFormData();
    prev.fields["medical.abdominal.vomiting"] = { value: false, status: "extracted", source: "je n'ai pas vomi", sourceSeq: 2, sourceAt: 9000 };
    prev.fields["medical.abdominal.nausea"] = { value: true, status: "extracted", source: "j'ai des nausées", sourceSeq: 2, sourceAt: 9000 };
    const f = processExtraction(out([item({ path: "medical.abdominal.vomiting", value: "oui", source_quote: "je n'ai pas vomi" })]), transcript, prev, { model: "t" });
    expect(f.fields["medical.abdominal.vomiting"]).toMatchObject({ value: true, status: "needs_verification" });
    expect(f.fields["medical.abdominal.vomiting"].notes?.join()).toMatch(/proposée auparavant/);
    expect(f.fields["medical.abdominal.nausea"]).toMatchObject({ value: true, status: "needs_verification", sourceSeq: 2 });
  });
  it("signale une contradiction sur un champ du médecin", () => {
    const prev = emptyFormData();
    prev.fields["medical.general.temperature"] = { value: 37, status: "confirmed" };
    const f = processExtraction(
      out([item({ path: "medical.general.temperature", value: "38", kind: "measured", source_quote: "Température mesurée à 38 degrés" })]),
      transcript,
      prev,
      { model: "t" },
    );
    expect(f.fields["medical.general.temperature"]).toMatchObject({ value: 37, status: "confirmed", aiValue: 38 });
    expect(f.fields["medical.general.temperature"].conflicts?.[0].value).toBe(38);
  });
});
