import { z } from "zod";
import { FIELD_BY_PATH, type FieldDef } from "./catalog";

/** Valeur d'un champ : texte, nombre, oui/non ou liste de codes d'options. */
export type FieldValue = string | number | boolean | string[];

export type FieldStatus = "extracted" | "needs_verification" | "not_mentioned" | "manual" | "confirmed";
export type Confidence = "high" | "medium" | "low";
export type Speaker = "patient" | "doctor" | "onboard_caregiver" | "unknown";
export type InfoKind = "reported" | "observed" | "measured" | "instruction";

export type FieldState = {
  value: FieldValue | null;
  status: FieldStatus;
  confidence?: Confidence;
  /** Extrait exact de la transcription justifiant la valeur. */
  source?: string;
  speaker?: Speaker;
  kind?: InfoKind;
  /** Remarques de contrôle (citation introuvable, valeur non mesurée...). */
  notes?: string[];
  /** Valeur proposée par l'IA, conservée quand le médecin la modifie ou la rejette. */
  aiValue?: FieldValue | null;
  rejected?: boolean;
};

export type MedicationLine = {
  id: string;
  name: string;
  dosage: string;
  posology: string;
  durationDays: number | null;
  indication: string;
  origin: "ai" | "manual";
  status: "proposed" | "accepted" | "rejected";
  source?: string;
  confidence?: Confidence;
  notes?: string[];
};

export type Contradiction = { paths: string[]; description: string; quotes: string[] };
export type MissingItem = { path: string; reason: string };

/** Appel de suivi (fiche de suivi, pages 7 et 8). Saisi uniquement par le médecin. */
export type FollowUpCall = {
  id: string;
  at: string | null;
  doctor: string;
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
  respRate: number | null;
  pain: number | null;
  temperature: number | null;
  glycemia: number | null;
  decision: string | null;
  nextCall: string;
  notes: string;
};

/** Diagramme de soins et de surveillance (page 9) : colonnes horodatées × lignes. */
export type CareChart = { columns: { id: string; at: string }[]; cells: Record<string, string> };

export const BODY_MARK_KINDS = [
  { code: "douleur", label: "Zone douloureuse" },
  { code: "plaie", label: "Plaie" },
  { code: "hematome", label: "Hématome" },
  { code: "fracture", label: "Fracture" },
  { code: "brulure", label: "Brûlure" },
  { code: "autre", label: "Autre lésion" },
] as const;
export type BodyMarkKind = (typeof BODY_MARK_KINDS)[number]["code"];
/** Annotation du schéma corporel (page 3), coordonnées relatives 0–1. */
export type BodyMark = { id: string; view: "front" | "back"; x: number; y: number; kind: BodyMarkKind; note: string };

export type ObservationFormData = {
  version: 1;
  fields: Record<string, FieldState>;
  medications: MedicationLine[];
  followUps: FollowUpCall[];
  careChart: CareChart;
  bodyMarks: BodyMark[];
  contradictions: Contradiction[];
  missing: MissingItem[];
  /** Informations rejetées lors de la validation de la réponse IA (pour transparence). */
  discarded: { path: string; value: string; reason: string }[];
  extractedAt?: string;
  model?: string;
};

export function emptyFormData(): ObservationFormData {
  return {
    version: 1,
    fields: {},
    medications: [],
    followUps: [],
    careChart: { columns: [], cells: {} },
    bodyMarks: [],
    contradictions: [],
    missing: [],
    discarded: [],
  };
}

export function isEmptyValue(v: FieldValue | null | undefined) {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Date et heure locales, format des champs datetime-local (AAAA-MM-JJTHH:MM). */
export const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const YES = new Set(["oui", "yes", "true", "vrai", "o", "1", "présent", "present"]);
const NO = new Set(["non", "no", "false", "faux", "n", "0", "absent", "aucun", "aucune"]);

/**
 * Convertit une valeur textuelle (réponse IA) dans le type du champ.
 * Retourne une erreur lisible si la valeur n'est pas compatible.
 */
export function normalizeValue(field: FieldDef, raw: string): { ok: true; value: FieldValue } | { ok: false; reason: string } {
  const text = raw.trim();
  if (!text) return { ok: false, reason: "valeur vide" };
  switch (field.type) {
    case "text":
    case "longtext":
      return { ok: true, value: text };
    case "yesno": {
      const v = text.toLowerCase();
      if (YES.has(v)) return { ok: true, value: true };
      if (NO.has(v)) return { ok: true, value: false };
      return { ok: false, reason: `« ${text} » n'est pas une réponse oui/non` };
    }
    case "number": {
      const match = text.replace(",", ".").match(/-?\d+(\.\d+)?/);
      if (!match) return { ok: false, reason: `« ${text} » n'est pas un nombre` };
      const n = Number(match[0]);
      if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) {
        return { ok: false, reason: `${n} est hors des limites plausibles (${field.min ?? "—"} à ${field.max ?? "—"})` };
      }
      return { ok: true, value: n };
    }
    case "choice": {
      const code = text.toLowerCase();
      if (field.options?.some((x) => x.code === code)) return { ok: true, value: code };
      return { ok: false, reason: `option « ${text} » inconnue` };
    }
    case "datetime":
      return DATETIME_RE.test(text) ? { ok: true, value: text.slice(0, 16) } : { ok: false, reason: `« ${text} » n'est pas une date` };
    case "multi": {
      const codes = [...new Set(text.toLowerCase().split(/[,;|]/).map((c) => c.trim()).filter(Boolean))];
      const unknown = codes.filter((c) => !field.options?.some((x) => x.code === c));
      if (!codes.length) return { ok: false, reason: "aucune option" };
      if (unknown.length) return { ok: false, reason: `option(s) inconnue(s) : ${unknown.join(", ")}` };
      return { ok: true, value: codes };
    }
  }
}

/** Validation d'une valeur saisie par le médecin (types stricts, options connues). */
export function isValidManualValue(field: FieldDef, value: FieldValue | null): boolean {
  if (value === null) return true;
  switch (field.type) {
    case "text":
    case "longtext":
      return typeof value === "string" && value.length <= (field.type === "text" ? 500 : 20000);
    case "yesno":
      return typeof value === "boolean";
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (field.min === undefined || value >= field.min) &&
        (field.max === undefined || value <= field.max)
      );
    case "choice":
      return typeof value === "string" && Boolean(field.options?.some((x) => x.code === value));
    case "datetime":
      return typeof value === "string" && DATETIME_RE.test(value);
    case "multi":
      return Array.isArray(value) && value.every((c) => field.options?.some((x) => x.code === c));
  }
}

const fieldStateSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
  status: z.enum(["extracted", "needs_verification", "not_mentioned", "manual", "confirmed"]),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  source: z.string().max(4000).optional(),
  speaker: z.enum(["patient", "doctor", "onboard_caregiver", "unknown"]).optional(),
  kind: z.enum(["reported", "observed", "measured", "instruction"]).optional(),
  notes: z.array(z.string().max(500)).max(10).optional(),
  aiValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]).optional(),
  rejected: z.boolean().optional(),
});

const medicationSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(200),
  dosage: z.string().max(200),
  posology: z.string().max(500),
  durationDays: z.number().int().min(0).max(3650).nullable(),
  indication: z.string().max(300),
  origin: z.enum(["ai", "manual"]),
  status: z.enum(["proposed", "accepted", "rejected"]),
  source: z.string().max(4000).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  notes: z.array(z.string().max(500)).max(10).optional(),
});

const num = (min: number, max: number) => z.number().min(min).max(max).nullable();
const id = z.string().min(1).max(64);
const followUpSchema = z.object({
  id,
  at: z.string().regex(DATETIME_RE).nullable(),
  doctor: z.string().max(200),
  systolic: num(30, 300),
  diastolic: num(10, 200),
  heartRate: num(10, 300),
  respRate: num(0, 80),
  pain: num(0, 10),
  temperature: num(30, 45),
  glycemia: num(0, 10),
  decision: z.enum(["soins_bord", "debarquement", "deroutement", "evasan", "evamed"]).nullable(),
  nextCall: z.string().max(300),
  notes: z.string().max(2000),
});
const careChartSchema = z.object({
  columns: z.array(z.object({ id, at: z.string().regex(DATETIME_RE) })).max(60),
  cells: z.record(z.string().max(160), z.string().max(100)),
});
const bodyMarkSchema = z.object({
  id,
  view: z.enum(["front", "back"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  kind: z.enum(["douleur", "plaie", "hematome", "fracture", "brulure", "autre"]),
  note: z.string().max(300),
});

/** Schéma de la fiche telle qu'envoyée par le navigateur : chaque champ est vérifié contre le catalogue. */
export const formDataSchema = z
  .object({
    version: z.literal(1),
    fields: z.record(z.string(), fieldStateSchema),
    medications: z.array(medicationSchema).max(50),
    // Ajoutés en phase 5 : absents des fiches plus anciennes.
    followUps: z.array(followUpSchema).max(20).default([]),
    careChart: careChartSchema.default({ columns: [], cells: {} }),
    bodyMarks: z.array(bodyMarkSchema).max(100).default([]),
    contradictions: z.array(z.object({ paths: z.array(z.string()).max(20), description: z.string().max(1000), quotes: z.array(z.string().max(1000)).max(10) })).max(50),
    missing: z.array(z.object({ path: z.string(), reason: z.string().max(500) })).max(200),
    discarded: z.array(z.object({ path: z.string(), value: z.string().max(2000), reason: z.string().max(500) })).max(200),
    extractedAt: z.string().optional(),
    model: z.string().max(100).optional(),
  })
  .superRefine((data, ctx) => {
    for (const [path, state] of Object.entries(data.fields)) {
      const field = FIELD_BY_PATH.get(path);
      if (!field) ctx.addIssue({ code: "custom", path: ["fields", path], message: "Champ inconnu" });
      else if (!isValidManualValue(field, state.value)) ctx.addIssue({ code: "custom", path: ["fields", path], message: `Valeur invalide pour « ${field.label} »` });
    }
  });

/** Nombre de champs encore à revoir (proposés par l'IA et pas encore acceptés ni modifiés). */
export function pendingReview(data: ObservationFormData) {
  const fields = Object.entries(data.fields).filter(([, s]) => s.status === "extracted" || s.status === "needs_verification");
  const meds = data.medications.filter((m) => m.status === "proposed");
  return { fields: fields.map(([p]) => p), medications: meds.map((m) => m.id), total: fields.length + meds.length };
}
