import { describe, expect, it } from "vitest";
import { processExtraction, quoteInTranscript, normalizeForMatch } from "./process";
import { aiOutputSchema, extractionJsonSchema, type AiOutput } from "./schema";
import { formDataSchema, pendingReview } from "@/lib/medical/form-state";
import { AI_FIELD_PATHS, FIELDS } from "@/lib/medical/catalog";

// Transcription synthétique (exemple du cahier des charges).
const transcript =
  "Le patient présente une douleur abdominale depuis hier soir, principalement au niveau de la fosse iliaque droite. " +
  "Il signale également des nausées, sans vomissements. Température mesurée à 38 degrés.";

type Item = AiOutput["fields"][number];
const item = (p: Partial<Item> & Pick<Item, "path" | "value" | "source_quote">): Item => ({
  confidence: "high",
  speaker: "doctor",
  kind: "reported",
  note: null,
  ...p,
});
const out = (fields: Item[], extra: Partial<AiOutput> = {}): AiOutput => ({ fields, medications: [], contradictions: [], missing_important: [], ...extra });

const example = out([
  item({ path: "history.illnessHistory", value: "Douleur abdominale depuis hier soir.", source_quote: "douleur abdominale depuis hier soir" }),
  item({ path: "medical.abdominal.location", value: "Fosse iliaque droite", source_quote: "au niveau de la fosse iliaque droite" }),
  item({ path: "medical.abdominal.nausea", value: "oui", source_quote: "Il signale également des nausées" }),
  item({ path: "medical.abdominal.vomiting", value: "non", source_quote: "sans vomissements" }),
  item({ path: "medical.general.temperature", value: "38", kind: "measured", source_quote: "Température mesurée à 38 degrés" }),
]);

describe("processExtraction : exemple du cahier des charges", () => {
  const form = processExtraction(example, transcript, null, { model: "test" });
  it("remplit les bons champs avec les bons types", () => {
    expect(form.fields["medical.abdominal.location"].value).toBe("Fosse iliaque droite");
    expect(form.fields["medical.abdominal.nausea"].value).toBe(true);
    expect(form.fields["medical.abdominal.vomiting"].value).toBe(false);
    expect(form.fields["medical.general.temperature"]).toMatchObject({ value: 38, status: "extracted", kind: "measured" });
  });
  it("laisse vide ce qui n'est pas mentionné (tension artérielle)", () => {
    expect(form.fields["vitals.circ.systolic"]).toEqual({ value: null, status: "not_mentioned" });
    expect(form.fields["vitals.circ.diastolic"].status).toBe("not_mentioned");
  });
  it("produit une fiche conforme au schéma et à revoir", () => {
    expect(formDataSchema.safeParse(form).success).toBe(true);
    expect(pendingReview(form).total).toBe(5);
  });
});

describe("garde-fous", () => {
  it("met à vérifier une constante non mesurée", () => {
    const t = "Il dit qu'il a de la fièvre, autour de 39 je pense.";
    const f = processExtraction(out([item({ path: "medical.general.temperature", value: "39", kind: "reported", source_quote: "autour de 39 je pense" })]), t, null);
    expect(f.fields["medical.general.temperature"].status).toBe("needs_verification");
    expect(f.fields["medical.general.temperature"].notes?.join()).toMatch(/mesurée/);
  });
  it("signale une citation absente de la transcription (valeur inventée)", () => {
    const f = processExtraction(out([item({ path: "vitals.circ.heartRate", value: "80", kind: "measured", source_quote: "pouls à 80" })]), transcript, null);
    expect(f.fields["vitals.circ.heartRate"]).toMatchObject({ status: "needs_verification", confidence: "low" });
  });
  it("écarte une valeur incompatible ou hors limites", () => {
    const f = processExtraction(
      out([
        item({ path: "vitals.circ.heartRate", value: "900", kind: "measured", source_quote: "Température mesurée" }),
        item({ path: "vitals.neuro.speech", value: "bavard", source_quote: "Le patient" }),
      ]),
      transcript,
      null,
    );
    expect(f.fields["vitals.circ.heartRate"].status).toBe("not_mentioned");
    expect(f.discarded.map((d) => d.path)).toEqual(["vitals.circ.heartRate", "vitals.neuro.speech"]);
  });
  it("met à vérifier les champs contradictoires et une confiance moyenne", () => {
    const t = "J'ai perdu connaissance. Non en fait je n'ai pas perdu connaissance.";
    const f = processExtraction(
      out([item({ path: "medical.syncope.lossOfConsciousness", value: "non", speaker: "patient", confidence: "low", source_quote: "je n'ai pas perdu connaissance" })], {
        contradictions: [{ paths: ["medical.syncope.lossOfConsciousness"], description: "Le patient revient sur sa déclaration.", quotes: ["J'ai perdu connaissance"] }],
      }),
      t,
      null,
    );
    expect(f.fields["medical.syncope.lossOfConsciousness"].status).toBe("needs_verification");
    expect(f.contradictions).toHaveLength(1);
  });
  it("signale deux valeurs différentes pour un même champ", () => {
    const t = "Fréquence cardiaque à 90. Je recompte : 110.";
    const f = processExtraction(
      out([
        item({ path: "vitals.circ.heartRate", value: "90", kind: "measured", source_quote: "Fréquence cardiaque à 90" }),
        item({ path: "vitals.circ.heartRate", value: "110", kind: "measured", source_quote: "Je recompte : 110" }),
      ]),
      t,
      null,
    );
    expect(f.fields["vitals.circ.heartRate"].status).toBe("needs_verification");
    expect(f.fields["vitals.circ.heartRate"].notes?.join()).toMatch(/110/);
  });
});

describe("fusion avec la fiche existante", () => {
  it("ne remplace jamais une saisie ou une confirmation du médecin", () => {
    const first = processExtraction(example, transcript, null);
    first.fields["medical.general.temperature"] = { value: 38.4, status: "manual" };
    first.fields["medical.abdominal.location"].status = "confirmed";
    const again = processExtraction(
      out([
        item({ path: "medical.general.temperature", value: "38", kind: "measured", source_quote: "Température mesurée à 38 degrés" }),
        item({ path: "medical.abdominal.location", value: "Flanc droit", source_quote: "fosse iliaque droite" }),
      ]),
      transcript,
      first,
    );
    expect(again.fields["medical.general.temperature"]).toMatchObject({ value: 38.4, status: "manual", aiValue: 38 });
    expect(again.fields["medical.abdominal.location"]).toMatchObject({ value: "Fosse iliaque droite", status: "confirmed" });
  });
  it("garde les médicaments décidés par le médecin et remplace les propositions", () => {
    const t = "Je vous prescris du paracétamol 1 g trois fois par jour pendant 3 jours pour la douleur.";
    const med = { name: "Paracétamol", dosage: "1 g", posology: "3 fois par jour", duration_days: 3, indication: "douleur", source_quote: "paracétamol 1 g trois fois par jour", confidence: "high" as const };
    const first = processExtraction(out([], { medications: [med] }), t, null);
    expect(first.medications[0]).toMatchObject({ status: "proposed", durationDays: 3 });
    first.medications[0].status = "accepted";
    const again = processExtraction(out([], { medications: [med, { ...med, name: "Ibuprofène", dosage: null, source_quote: "ibuprofène" }] }), t, first);
    expect(again.medications.map((m) => [m.name, m.status])).toEqual([["Paracétamol", "accepted"], ["Ibuprofène", "proposed"]]);
    expect(again.medications[1].notes?.length).toBe(2);
  });
});

describe("schéma et citations", () => {
  it("le JSON Schema couvre tous les champs extractibles", () => {
    expect(extractionJsonSchema().schema.properties.fields.items.properties.path.enum).toEqual(AI_FIELD_PATHS);
    expect(AI_FIELD_PATHS).not.toContain("teleconsultation.sentToCcmm");
    expect(new Set(FIELDS.map((f) => f.path)).size).toBe(FIELDS.length);
  });
  it("refuse un chemin inconnu", () => {
    expect(aiOutputSchema.safeParse(out([item({ path: "decision.evasan", value: "oui", source_quote: "x" })])).success).toBe(false);
  });
  it("retrouve une citation malgré accents, casse et ponctuation", () => {
    const n = normalizeForMatch(transcript);
    expect(quoteInTranscript("TEMPERATURE mesuree a 38 degres", n)).toBe(true);
    expect(quoteInTranscript("douleur abdominale … fosse iliaque droite", n)).toBe(true);
    expect(quoteInTranscript("douleur thoracique", n)).toBe(false);
    expect(quoteInTranscript("", n)).toBe(false);
  });
});

describe("scénarios d'évaluation", async () => {
  const { SCENARIOS } = await import("./scenarios");
  const { FIELD_BY_PATH } = await import("@/lib/medical/catalog");
  const { isValidManualValue } = await import("@/lib/medical/form-state");
  it("ne référencent que des champs et valeurs du catalogue", () => {
    for (const s of SCENARIOS) {
      for (const [p, v] of Object.entries(s.expect)) {
        const f = FIELD_BY_PATH.get(p);
        expect(f, p).toBeDefined();
        expect(isValidManualValue(f!, v), `${s.name} ${p}`).toBe(true);
      }
      for (const p of [...s.absent, ...(s.expectNeedsVerification ?? [])]) expect(FIELD_BY_PATH.get(p), p).toBeDefined();
    }
  });
});
