/**
 * Signes d'alerte configurés : ils demandent une relecture par le médecin.
 * Ils ne posent aucun diagnostic et ne trient pas le patient ; toutes les
 * décisions restent au médecin. Une alerte est calculée à partir de ce que la
 * fiche contient (y compris les propositions de l'IA pas encore vérifiées,
 * pour attirer l'attention au plus tôt), jamais à partir d'une absence.
 */
import { isEmptyValue, type ObservationFormData, type SymptomState } from "@/lib/medical/form-state";

export type UrologyAlert = { id: string; title: string; detail: string; evidence: string[] };

type Ctx = { form: ObservationFormData; present: (id: string) => SymptomState | null; temperature: number | null };

const RULES: { id: string; title: string; detail: string; test: (c: Ctx) => SymptomState[] | null }[] = [
  {
    id: "retention_aigue",
    title: "Rétention urinaire aiguë",
    detail: "Impossibilité d'uriner rapportée ou constatée.",
    test: (c) => one(c.present("retention")),
  },
  {
    id: "anurie",
    title: "Anurie",
    detail: "Absence d'urine rapportée.",
    test: (c) => one(c.present("anurie")),
  },
  {
    id: "fievre_douleur_lombaire",
    title: "Fièvre associée à une douleur lombaire ou du flanc",
    detail: "Fièvre (rapportée ou mesurée ≥ 38 °C) avec douleur lombaire, du flanc ou colique néphrétique.",
    test: (c) => {
      const pain = c.present("douleur_lombaire") ?? c.present("douleur_flanc") ?? c.present("colique_nephretique");
      const fever = c.present("fievre");
      if (!pain || (!fever && !(c.temperature !== null && c.temperature >= 38))) return null;
      return fever ? [fever, pain] : [pain];
    },
  },
  {
    id: "hematurie_caillots",
    title: "Hématurie macroscopique avec caillots",
    detail: "Caillots dans les urines rapportés.",
    test: (c) => {
      const clots = c.present("caillots");
      if (!clots) return null;
      const blood = c.present("hematurie_macro") ?? c.present("hematurie_totale") ?? c.present("hematurie_terminale") ?? c.present("hematurie_initiale");
      return blood ? [blood, clots] : [clots];
    },
  },
  {
    id: "douleur_testiculaire_brutale",
    title: "Douleur testiculaire brutale et intense",
    detail: "Douleur testiculaire ou scrotale de début brutal ou d'intensité ≥ 7/10.",
    test: (c) => {
      const pain = c.present("douleur_testiculaire") ?? c.present("douleur_scrotale");
      if (!pain) return null;
      const sudden = /brutal|brusque|soudain|d'un coup|tout à coup|subit/i.test(`${pain.attrs.onset ?? ""} ${pain.expression ?? ""}`);
      const n = Number((pain.attrs.severity ?? "").match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", "."));
      return sudden || (Number.isFinite(n) && n >= 7) ? [pain] : null;
    },
  },
  {
    id: "traumatisme_urologique",
    title: "Traumatisme urologique",
    detail: "Traumatisme de l'appareil urinaire ou génital rapporté.",
    test: (c) => one(c.present("traumatisme_urologique")),
  },
];

const one = (s: SymptomState | null) => (s ? [s] : null);

export const ALERT_IDS = RULES.map((r) => r.id);

export function computeAlerts(form: ObservationFormData): UrologyAlert[] {
  const symptoms = form.symptoms ?? {};
  const present = (id: string) => {
    const s = symptoms[id];
    return s && s.presence === "yes" && !s.rejected ? s : null;
  };
  const temps = ["uro.exam.temperature", "medical.general.temperature"]
    .map((p) => form.fields[p]?.value)
    .filter((v): v is number => typeof v === "number" && !isEmptyValue(v));
  const ctx: Ctx = { form, present, temperature: temps.length ? Math.max(...temps) : null };
  const alerts: UrologyAlert[] = [];
  for (const rule of RULES) {
    const hit = rule.test(ctx);
    if (!hit) continue;
    alerts.push({
      id: rule.id,
      title: rule.title,
      detail: rule.detail,
      evidence: hit.map((s) => s.source ?? s.expression ?? "").filter(Boolean),
    });
  }
  return alerts;
}
