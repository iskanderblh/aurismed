/**
 * Mise en forme des données validées pour les PDF. Fonctions pures (testées) :
 * aucune valeur n'est ajoutée ou déduite, un champ vide n'est pas imprimé.
 */
import { computeAge, type ConsultationDraftInput } from "@/lib/consultation/schema";
import { DECISION_OPTIONS, FIELDS, SECTIONS, optionLabel, type FieldDef, type SectionKey } from "@/lib/medical/catalog";
import { BODY_MARK_KINDS, isEmptyValue, type FieldValue, type ObservationFormData } from "@/lib/medical/form-state";
import { printableLines } from "@/lib/prescription/schema";

export type Row = { label: string; value: string };
export type Group = { title: string; rows: Row[] };
export type Section = { key: SectionKey; title: string; groups: Group[] };

/** « 2026-11-25T14:30 » → « 25/11/2026 à 14:30 » ; « 2026-11-25 » → « 25/11/2026 ». */
export function formatLocal(v: string | null | undefined) {
  if (!v) return "";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` à ${m[4]}` : ""}`;
}

/** Horodatage ISO dans le fuseau du médecin (défaut Europe/Paris si fuseau inconnu). */
export function formatInstant(iso: string | null | undefined, timeZone: string) {
  if (!iso) return "";
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
  } catch {
    tz = "Europe/Paris";
  }
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: tz }).format(new Date(iso)).replace(" ", " à ");
}

export function formatFieldValue(field: FieldDef, value: FieldValue | null | undefined): string {
  if (isEmptyValue(value)) return "";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (Array.isArray(value)) return value.map((c) => optionLabel(field, c)).join(", ");
  if (field.type === "choice") return optionLabel(field, String(value));
  if (field.type === "datetime") return formatLocal(String(value));
  if (typeof value === "number") return `${String(value).replace(".", ",")}${field.unit ? ` ${field.unit}` : ""}`;
  return String(value);
}

/** Sections de la fiche avec uniquement les champs renseignés, dans l'ordre de la fiche de référence. */
export function observationSections(form: ObservationFormData): Section[] {
  return SECTIONS.map((s) => {
    const groups: Group[] = [];
    for (const f of FIELDS.filter((x) => x.section === s.key)) {
      const value = formatFieldValue(f, form.fields[f.path]?.value);
      if (!value) continue;
      let g = groups.find((x) => x.title === f.group);
      if (!g) groups.push((g = { title: f.group, rows: [] }));
      g.rows.push({ label: f.label, value });
    }
    return { key: s.key, title: s.title, groups };
  });
}

const val = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const rows = (pairs: [string, unknown][]): Row[] => pairs.map(([label, v]) => ({ label, value: val(v) })).filter((r) => r.value);

/** Identification (page 1) : appel, patient, navire. */
export function identification(draft: ConsultationDraftInput, at: Date) {
  const c = draft.call;
  const p = draft.patient;
  const v = draft.vessel;
  const age = p.age !== undefined && p.age !== "" ? Number(p.age) : p.dateOfBirth ? computeAge(p.dateOfBirth, at) : undefined;
  const port = (x?: { name?: string; dateOrDelay?: string }) => [x?.name, x?.dateOrDelay].map(val).filter(Boolean).join(" · ");
  return {
    call: rows([
      ["Date", formatLocal(c.callDate)],
      ["Heure d'appel locale", c.callTime],
      ["ATU", c.atu],
      ["Médecin CCMM", c.ccmmDoctor],
      ["Responsable de soins", c.careManager],
    ]),
    patient: rows([
      ["Nom", p.lastName ? p.lastName.toUpperCase() : ""],
      ["Prénom", p.firstName],
      ["Date de naissance", formatLocal(p.dateOfBirth)],
      ["Âge", age !== undefined && Number.isFinite(age) ? `${age} ans` : ""],
      ["Sexe", p.gender === "M" ? "Masculin" : p.gender === "F" ? "Féminin" : ""],
      ["Nationalité", p.nationality],
      ["N° d'immatriculation", p.registrationNumber],
      ["Fonction à bord", p.role],
    ]),
    vessel: rows([
      ["Navire", v.name],
      ["Pavillon", v.flag],
      ["Type", v.type],
      ["Dotation", v.allocation ? `${v.allocation}${v.allocationRestricted ? " (restreinte)" : ""}` : ""],
      ["Armateur", v.owner],
      ["Indicatif / MMSI", v.callSignMmsi],
      ["Tél. passerelle", v.bridgePhone],
      ["Tél. infirmerie", v.infirmaryPhone],
      ["Fax", v.fax],
      ["E-mail", v.email],
      ["Telex", v.telex],
      ["Coordonnées GPS", v.gpsCoordinates],
      ["Position", v.position],
      ["Port d'origine", port(v.originPort)],
      ["Destination", port(v.destination)],
      ["Escale prévue", port(v.plannedCall)],
      ["Escale possible", port(v.possibleCall)],
    ]),
  };
}

export const decisionLabel = (code: string | null | undefined) => (code ? (DECISION_OPTIONS.find((o) => o.code === code)?.label ?? code) : "");
export const bodyMarkLabel = (code: string) => BODY_MARK_KINDS.find((k) => k.code === code)?.label ?? code;

const num = (n: number | null, unit = "") => (n === null ? "" : `${String(n).replace(".", ",")}${unit}`);

/** Fiche de suivi : une ligne par appel, constantes telles que saisies. */
export function followUpRows(form: ObservationFormData) {
  return form.followUps.map((c, i) => ({
    number: i + 2,
    at: formatLocal(c.at),
    doctor: c.doctor.trim(),
    ta: c.systolic !== null || c.diastolic !== null ? `${num(c.systolic) || "?"}/${num(c.diastolic) || "?"}` : "",
    fc: num(c.heartRate),
    fr: num(c.respRate),
    en: num(c.pain),
    temp: num(c.temperature),
    glycemia: num(c.glycemia),
    decision: decisionLabel(c.decision),
    nextCall: c.nextCall.trim(),
    notes: c.notes.trim(),
  }));
}

export { printableLines };

export const durationLabel = (d: number | null) => (d === null ? "" : `${d} jour${d > 1 ? "s" : ""}`);

/** Diagramme découpé en blocs de colonnes pour tenir sur la largeur d'une page. */
export function careChartChunks(form: ObservationFormData, size = 8) {
  const cols = [...form.careChart.columns].sort((a, b) => a.at.localeCompare(b.at));
  const chunks: (typeof cols)[] = [];
  for (let i = 0; i < cols.length; i += size) chunks.push(cols.slice(i, i + size));
  return chunks;
}

/** Nom de fichier sûr : « fiche-observation_DUPONT_2026-11-25_v2.pdf ». */
export function documentFileName(type: "observation" | "prescription", lastName: string | undefined, date: string, version: number) {
  const name = (lastName ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 40);
  return `${type === "observation" ? "fiche-observation" : "ordonnance"}${name ? `_${name}` : ""}_${date.slice(0, 10)}_v${version}.pdf`;
}
