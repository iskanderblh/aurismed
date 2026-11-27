// Données synthétiques uniquement.
import { describe, expect, it } from "vitest";
import { emptyFormData, formDataSchema, pendingReview, type ObservationFormData, type SymptomState } from "@/lib/medical/form-state";
import { maritimeEnabled } from "@/lib/medical/context";
import { applyProposals } from "@/lib/medical/reconcile";
import { computeAlerts } from "./alerts";
import { applySymptomProposals, resolveSymptomConflict, type SymptomProposal } from "./symptoms";
import { CATEGORIES, SYMPTOMS, buildTaxonomy, customCode, searchSymptoms } from "./taxonomy";

const prop = (id: string, presence: SymptomProposal["presence"], extra: Partial<SymptomProposal> = {}): SymptomProposal => ({
  id,
  presence,
  attrs: {},
  expression: "expression",
  confidence: "high",
  speaker: "patient",
  kind: "reported",
  source: "citation",
  needsCheck: false,
  ...extra,
});
const sym = (presence: SymptomState["presence"], extra: Partial<SymptomState> = {}): SymptomState => ({ presence, status: "extracted", attrs: {}, aiPresence: presence, ...extra });
const withSymptoms = (symptoms: Record<string, SymptomState>, extra: Partial<ObservationFormData> = {}): ObservationFormData => ({ ...emptyFormData(), symptoms, ...extra });

describe("taxonomie urologique", () => {
  it("a des identifiants uniques, des catégories connues et les symptômes d'alerte", () => {
    const ids = SYMPTOMS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const cats = new Set(CATEGORIES.map((c) => c.key));
    for (const s of SYMPTOMS) {
      expect(cats.has(s.category), s.id).toBe(true);
      expect(s.id).toMatch(/^[a-z0-9_]{2,60}$/);
    }
    for (const id of ["retention", "anurie", "fievre", "douleur_lombaire", "caillots", "douleur_testiculaire", "traumatisme_urologique"]) expect(ids).toContain(id);
  });

  it("retrouve un symptôme par l'expression du patient, sans accents ni casse", () => {
    expect(searchSymptoms("brulures").map((s) => s.id)).toContain("brulures_mictionnelles");
    expect(searchSymptoms("")).toEqual([]);
  });

  it("ajoute les synonymes du médecin à un terme intégré et ses propres termes, sans rien retirer", () => {
    const t = buildTaxonomy([
      { code: "nycturie", name: "Nycturie", category: "filling", synonyms: ["je me relève la nuit"], description: "" },
      { code: customCode("Douleur périnéale à l'effort"), name: "Douleur périnéale à l'effort", category: "pain", synonyms: [], description: "" },
    ]);
    expect(t.length).toBe(SYMPTOMS.length + 1);
    expect(t.find((s) => s.id === "nycturie")!.synonyms).toContain("je me relève la nuit");
    expect(searchSymptoms("relève la nuit", t)[0].id).toBe("nycturie");
    expect(t.find((s) => s.id === "custom_douleur_perineale_a_l_effort")?.custom).toBe(true);
    // la base intégrée n'est pas modifiée
    expect(SYMPTOMS.find((s) => s.id === "nycturie")!.synonyms).not.toContain("je me relève la nuit");
  });
});

describe("fusion des symptômes proposés", () => {
  it("ajoute un symptôme non documenté, à vérifier si la proposition l'exige", () => {
    const r = applySymptomProposals({}, [prop("dysurie", "yes"), prop("fievre", "no", { needsCheck: true, notes: ["x"] })]);
    expect(r.symptoms.dysurie.status).toBe("extracted");
    expect(r.symptoms.fievre).toMatchObject({ status: "needs_verification", presence: "no", notes: ["x"] });
    expect(r.filled).toEqual(["dysurie", "fievre"]);
  });

  it("ne change jamais la présence : une information contraire devient une contradiction", () => {
    const r = applySymptomProposals({ fievre: sym("no") }, [prop("fievre", "yes", { source: "si, j'ai eu de la fièvre" })]);
    expect(r.symptoms.fievre.presence).toBe("no");
    expect(r.symptoms.fievre.status).toBe("needs_verification");
    expect(r.symptoms.fievre.conflicts).toEqual([{ source: "si, j'ai eu de la fièvre", speaker: "patient", presence: "yes" }]);
    // la même contradiction n'est pas répétée
    expect(applySymptomProposals(r.symptoms, [prop("fievre", "yes")]).conflicts).toEqual([]);
  });

  it("garde le statut du médecin et ne repropose pas un symptôme rejeté", () => {
    const doctor = sym("yes", { status: "manual", attrs: { side: "gauche" }, aiPresence: "yes" });
    const r = applySymptomProposals({ douleur_lombaire: doctor, dysurie: sym("yes", { status: "manual", rejected: true }) }, [
      prop("douleur_lombaire", "yes", { attrs: { side: "droit" } }),
      prop("dysurie", "yes"),
    ]);
    expect(r.symptoms.douleur_lombaire.status).toBe("manual");
    expect(r.symptoms.douleur_lombaire.attrs.side).toBe("gauche");
    expect(r.symptoms.douleur_lombaire.conflicts?.[0].attrs).toEqual({ side: "droit" });
    expect(r.symptoms.dysurie).toEqual(sym("yes", { status: "manual", rejected: true }));
  });

  it("complète une caractéristique vide d'une proposition de l'IA", () => {
    const r = applySymptomProposals({ nycturie: sym("yes") }, [prop("nycturie", "yes", { attrs: { count: "3 fois" } })]);
    expect(r.symptoms.nycturie.attrs.count).toBe("3 fois");
    expect(r.symptoms.nycturie.conflicts).toBeUndefined();
  });

  it("le médecin tranche : nouvelle information confirmée, ou valeur actuelle gardée", () => {
    const s = applySymptomProposals({ fievre: sym("no") }, [prop("fievre", "yes")]).symptoms.fievre;
    expect(resolveSymptomConflict(s, 0, "new")).toMatchObject({ presence: "yes", status: "confirmed", conflicts: undefined });
    expect(resolveSymptomConflict(s, 0, "current")).toMatchObject({ presence: "no", conflicts: undefined });
  });

  it("passe par applyProposals et bloque la validation tant que les symptômes ne sont pas revus", () => {
    const { form, report } = applyProposals(emptyFormData(), { fields: [], medications: [], contradictions: [], discarded: [], symptoms: [prop("dysurie", "yes")] });
    expect(report.filled).toContain("symptome:dysurie");
    expect(pendingReview(form).symptoms).toEqual(["dysurie"]);
    expect(pendingReview(form).total).toBe(1);
    const reviewed = { ...form, symptoms: { dysurie: { ...form.symptoms!.dysurie, status: "confirmed" as const } } };
    expect(pendingReview(reviewed).total).toBe(0);
  });

  it("valide la structure des symptômes enregistrés", () => {
    expect(formDataSchema.safeParse(withSymptoms({ dysurie: sym("yes", { attrs: { duration: "3 jours" } }) })).success).toBe(true);
    expect(formDataSchema.safeParse(withSymptoms({ "Bad Id!": sym("yes") })).success).toBe(false);
    expect(formDataSchema.safeParse(withSymptoms({ dysurie: { ...sym("yes"), attrs: { inconnu: "x" } as never } })).success).toBe(false);
  });
});

describe("signes d'alerte", () => {
  it("ne se déclenchent pas sans élément présent (jamais à partir d'une absence)", () => {
    expect(computeAlerts(emptyFormData())).toEqual([]);
    expect(computeAlerts(withSymptoms({ retention: sym("no"), anurie: sym("uncertain"), fievre: sym("no"), douleur_lombaire: sym("yes") }))).toEqual([]);
  });

  it("signalent rétention, anurie, caillots et traumatisme présents", () => {
    const ids = computeAlerts(
      withSymptoms({ retention: sym("yes"), anurie: sym("yes"), caillots: sym("yes"), traumatisme_urologique: sym("yes") }),
    ).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["retention_aigue", "anurie", "hematurie_caillots", "traumatisme_urologique"]));
  });

  it("fièvre rapportée ou température ≥ 38 °C avec douleur lombaire", () => {
    expect(computeAlerts(withSymptoms({ fievre: sym("yes"), douleur_flanc: sym("yes") })).map((a) => a.id)).toEqual(["fievre_douleur_lombaire"]);
    const measured = withSymptoms({ colique_nephretique: sym("yes") }, { fields: { "uro.exam.temperature": { value: 38.6, status: "manual" } } });
    expect(computeAlerts(measured).map((a) => a.id)).toEqual(["fievre_douleur_lombaire"]);
    const low = withSymptoms({ colique_nephretique: sym("yes") }, { fields: { "uro.exam.temperature": { value: 37.4, status: "manual" } } });
    expect(computeAlerts(low)).toEqual([]);
  });

  it("douleur testiculaire brutale ou intense uniquement", () => {
    expect(computeAlerts(withSymptoms({ douleur_testiculaire: sym("yes", { attrs: { onset: "brutal, ce matin" } }) })).map((a) => a.id)).toEqual(["douleur_testiculaire_brutale"]);
    expect(computeAlerts(withSymptoms({ douleur_testiculaire: sym("yes", { attrs: { onset: "progressive" } }) }))).toEqual([]);
  });

  it("ignorent un symptôme rejeté par le médecin", () => {
    expect(computeAlerts(withSymptoms({ retention: sym("yes", { status: "manual", rejected: true }) }))).toEqual([]);
  });
});

describe("contexte maritime optionnel", () => {
  it("désactivé pour une nouvelle fiche, conservé pour une fiche maritime existante, sinon choisi par le médecin", () => {
    expect(maritimeEnabled(null)).toBe(false);
    expect(maritimeEnabled(emptyFormData())).toBe(false);
    expect(maritimeEnabled({ ...emptyFormData(), fields: { "vitals.circ.heartRate": { value: 90, status: "manual" } } })).toBe(true);
    expect(maritimeEnabled({ ...emptyFormData(), fields: { "uro.lab.psa": { value: "2,1", status: "manual" } } })).toBe(false);
    expect(maritimeEnabled({ ...emptyFormData(), maritime: true })).toBe(true);
    expect(maritimeEnabled({ ...emptyFormData(), maritime: false, fields: { "vitals.circ.heartRate": { value: 90, status: "manual" } } })).toBe(false);
  });
});
