// Données synthétiques uniquement.
import { describe, expect, it } from "vitest";
import { FIELD_BY_PATH } from "@/lib/medical/catalog";
import { buildTaxonomy } from "@/lib/urology/taxonomy";
import { buildProposals } from "./incremental";
import { fieldRule, processExtraction } from "./process";
import { fieldCatalogForPrompt, systemPrompt, userPrompt } from "./prompt";
import { aiOutputSchema, extractionJsonSchema, type AiOutput } from "./schema";
import type { PromptSegment } from "./prompt";

const segs: PromptSegment[] = [
  { seq: 0, startMs: 1000, speaker: "doctor", text: "Bonjour, qu'est-ce qui vous amène ?" },
  { seq: 1, startMs: 3000, speaker: "patient", text: "J'ai des brûlures quand je fais pipi depuis trois jours." },
  { seq: 2, startMs: 8000, speaker: "patient", text: "Pas de fièvre, je n'ai pas eu de fièvre." },
  { seq: 3, startMs: 12000, speaker: "doctor", text: "La prostate est souple et indolore." },
  { seq: 4, startMs: 16000, speaker: "patient", text: "Mon médecin dit que la prostate est un peu grosse." },
];
type F = AiOutput["fields"][number];
type S = AiOutput["symptoms"][number];
const field = (p: Partial<F> & Pick<F, "path" | "value" | "source_quote">): F => ({ confidence: "high", speaker: "unknown", kind: "reported", note: null, segment: null, ...p });
const symptom = (p: Partial<S> & Pick<S, "id" | "presence" | "source_quote">): S => ({
  expression: p.source_quote,
  confidence: "high",
  speaker: "unknown",
  kind: "reported",
  segment: null,
  ...p,
});
const out = (extra: Partial<AiOutput>): AiOutput => ({ fields: [], symptoms: [], medications: [], contradictions: [], missing_important: [], ...extra });

describe("symptômes proposés par le modèle", () => {
  it("rattache le symptôme à sa réplique, garde l'expression d'origine et l'interlocuteur connu", () => {
    const set = buildProposals(
      out({ symptoms: [symptom({ id: "brulures_mictionnelles", presence: "yes", source_quote: "J'ai des brûlures quand je fais pipi", duration: "3 jours", speaker: "doctor" })] }),
      segs,
      { full: false },
    );
    expect(set.symptoms).toHaveLength(1);
    expect(set.symptoms![0]).toMatchObject({ id: "brulures_mictionnelles", presence: "yes", sourceSeq: 1, sourceAt: 3000, speaker: "patient", needsCheck: false, attrs: { duration: "3 jours" } });
  });

  it("écarte un symptôme hors taxonomie, met à vérifier une citation introuvable ou une valeur non mesurée", () => {
    const set = buildProposals(
      out({
        symptoms: [
          symptom({ id: "symptome_invente", presence: "yes", source_quote: "brûlures" }),
          symptom({ id: "hematurie_macro", presence: "yes", source_quote: "du sang dans les urines" }),
          symptom({ id: "fievre", presence: "no", source_quote: "Pas de fièvre", value: "39" }),
        ],
      }),
      segs,
      { full: false },
    );
    expect(set.discarded.map((d) => d.path)).toContain("symptome:symptome_invente");
    const byId = Object.fromEntries(set.symptoms!.map((s) => [s.id, s]));
    expect(byId.hematurie_macro).toMatchObject({ needsCheck: true, confidence: "low" });
    expect(byId.fievre.needsCheck).toBe(true);
    expect(byId.fievre.notes).toContain("Valeur non indiquée comme mesurée : à vérifier.");
  });

  it("ne garde que les caractéristiques prévues pour le symptôme", () => {
    const set = buildProposals(out({ symptoms: [symptom({ id: "fievre", presence: "no", source_quote: "Pas de fièvre", radiation: "vers l'aine", details: "aucune" })] }), segs, { full: false });
    expect(set.symptoms![0].attrs).toEqual({ details: "aucune" });
  });

  it("reconnaît un terme ajouté par le médecin", () => {
    const taxonomy = buildTaxonomy([{ code: "custom_pipi_qui_brule", name: "Pipi qui brûle", category: "custom", synonyms: [], description: "" }]);
    const set = buildProposals(out({ symptoms: [symptom({ id: "custom_pipi_qui_brule", presence: "yes", source_quote: "brûlures quand je fais pipi" })] }), segs, { full: false, taxonomy });
    expect(set.symptoms![0].id).toBe("custom_pipi_qui_brule");
  });
});

describe("examen clinique : seulement ce que le médecin constate", () => {
  const prostate = FIELD_BY_PATH.get("uro.exam.prostate")!;
  it("écarte une constatation rapportée par le patient ou d'interlocuteur inconnu", () => {
    expect(fieldRule(prostate, { speaker: "patient", kind: "reported" }, {})).toMatchObject({ discard: expect.any(String) });
    expect(fieldRule(prostate, { speaker: "unknown", kind: "observed" }, {})).toMatchObject({ discard: expect.any(String) });
    expect(fieldRule(prostate, { speaker: "doctor", kind: "observed" }, {})).toEqual({ skip: false, needsCheck: true, notes: ["Constatation d'examen : à confirmer par le médecin."] });
  });

  it("en direct : la phrase du médecin est proposée à vérifier, celle du patient écartée", () => {
    const set = buildProposals(
      out({
        fields: [
          field({ path: "uro.exam.prostate", value: "Prostate souple, indolore", kind: "observed", speaker: "doctor", source_quote: "La prostate est souple et indolore" }),
          field({ path: "uro.exam.testes", value: "Normal", kind: "observed", speaker: "doctor", source_quote: "la prostate est un peu grosse" }),
        ],
      }),
      segs,
      { full: false },
    );
    expect(set.fields.map((f) => [f.path, f.needsCheck])).toEqual([["uro.exam.prostate", true]]);
    // l'interlocuteur réel de la réplique (patient) prime sur celui donné par le modèle
    expect(set.discarded.map((d) => d.path)).toContain("uro.exam.testes");
  });

  it("n'infère jamais un examen normal en fin de consultation", () => {
    const transcript = segs.map((s) => s.text).join(" ");
    const form = processExtraction(
      out({ fields: [field({ path: "uro.exam.abdomen", value: "Abdomen souple", kind: "observed", speaker: "unknown", source_quote: "souple" })] }),
      transcript,
      null,
      { model: "test", maritime: false },
    );
    expect(form.fields["uro.exam.abdomen"]).toEqual({ value: null, status: "not_mentioned" });
    expect(form.discarded.map((d) => d.path)).toContain("uro.exam.abdomen");
  });
});

describe("contexte maritime optionnel", () => {
  it("retire les champs maritimes du schéma et du prompt quand il est désactivé", () => {
    const schema = extractionJsonSchema({ maritime: false }) as unknown as { schema: { properties: { fields: { items: { properties: { path: { enum: string[] } } } } } } };
    const paths = schema.schema.properties.fields.items.properties.path.enum;
    expect(paths).toContain("uro.history.duration");
    expect(paths.some((p) => p.startsWith("vitals.") || p.startsWith("decision."))).toBe(false);
    expect(fieldCatalogForPrompt({ maritime: false })).not.toContain("vitals.circ.heartRate");
    expect(fieldCatalogForPrompt({ maritime: true })).toContain("vitals.circ.heartRate");
    expect(userPrompt("texte", { maritime: false })).toContain("brulures_mictionnelles");
  });

  it("ignore un champ maritime renvoyé malgré tout par le modèle", () => {
    const transcript = "Le pouls est à 90.";
    const form = processExtraction(
      out({ fields: [field({ path: "vitals.circ.heartRate", value: "90", kind: "measured", speaker: "doctor", source_quote: "Le pouls est à 90" })] }),
      transcript,
      null,
      { model: "test", maritime: false },
    );
    expect(form.fields["vitals.circ.heartRate"]).toBeUndefined();
  });

  it("le prompt système interdit diagnostic, examen inventé et prescription d'examens", () => {
    const p = systemPrompt({ maritime: false });
    expect(p).toMatch(/diagnostic/i);
    expect(p).toMatch(/examen/i);
    expect(aiOutputSchema.parse({ fields: [], medications: [], contradictions: [], missing_important: [] }).symptoms).toEqual([]);
  });
});

describe("analyse complète d'une consultation d'urologie", () => {
  it("documente les symptômes, préserve contexte et alertes vues", () => {
    const transcript = segs.map((s) => s.text).join(" ");
    const prev = { ...processExtraction(out({}), transcript, null, { model: "t" }), maritime: false, alertsReviewed: { anurie: "2026-11-27T10:00:00Z" } };
    const form = processExtraction(
      out({
        symptoms: [
          symptom({ id: "brulures_mictionnelles", presence: "yes", source_quote: "J'ai des brûlures quand je fais pipi depuis trois jours" }),
          symptom({ id: "fievre", presence: "no", source_quote: "Pas de fièvre" }),
        ],
      }),
      transcript,
      prev,
      { model: "t", maritime: false },
    );
    expect(form.symptoms?.brulures_mictionnelles).toMatchObject({ presence: "yes", status: "extracted" });
    expect(form.symptoms?.fievre).toMatchObject({ presence: "no", status: "extracted" });
    expect(form.maritime).toBe(false);
    expect(form.alertsReviewed).toEqual({ anurie: "2026-11-27T10:00:00Z" });
  });
});
