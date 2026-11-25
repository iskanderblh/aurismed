import { z } from "zod";

/**
 * Données administratives d'une consultation (page 1 de la fiche d'observation).
 * Tous les champs sont facultatifs : un brouillon peut être enregistré à tout moment.
 */

const text = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum`)
    .optional()
    .transform((v) => (v ? v : undefined));

const isoDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), "Date invalide");

const isoTime = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || /^\d{2}:\d{2}$/.test(v), "Heure invalide");

/** En-tête de la fiche : date, heure d'appel, ATU, médecin CCMM, responsable de soins. */
export const callInformationSchema = z.object({
  callDate: isoDate,
  callTime: isoTime,
  atu: text(50),
  ccmmDoctor: text(),
  careManager: text(),
});

export const patientSchema = z.object({
  lastName: text(),
  firstName: text(),
  dateOfBirth: isoDate.refine(
    (v) => v === undefined || new Date(v) <= new Date(),
    "La date de naissance ne peut pas être dans le futur",
  ),
  age: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? undefined : Number(v)))
    .refine((v) => v === undefined || (Number.isInteger(v) && v >= 0 && v <= 130), "Âge invalide"),
  nationality: text(),
  gender: z.enum(["M", "F"]).optional().or(z.literal("").transform(() => undefined)),
  registrationNumber: text(100),
  role: text(),
});

/** Port ou escale avec sa date ou son délai, comme sur la fiche. */
const portSchema = z.object({ name: text(), dateOrDelay: text(100) });

export const vesselSchema = z.object({
  name: text(),
  flag: text(),
  type: text(),
  allocation: z.enum(["A", "B", "C"]).optional().or(z.literal("").transform(() => undefined)),
  allocationRestricted: z.boolean().optional(),
  owner: text(),
  callSignMmsi: text(100),
  bridgePhone: text(50),
  infirmaryPhone: text(50),
  fax: text(50),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || z.email().safeParse(v).success, "E-mail invalide"),
  telex: text(50),
  gpsCoordinates: text(100),
  position: text(),
  originPort: portSchema,
  destination: portSchema,
  plannedCall: portSchema,
  possibleCall: portSchema,
});

export const consultationDraftSchema = z.object({
  call: callInformationSchema,
  patient: patientSchema,
  vessel: vesselSchema,
});

export type CallInformation = z.input<typeof callInformationSchema>;
export type PatientInformation = z.input<typeof patientSchema>;
export type VesselInformation = z.input<typeof vesselSchema>;
export type ConsultationDraftInput = z.input<typeof consultationDraftSchema>;
export type ConsultationDraft = z.output<typeof consultationDraftSchema>;

export const emptyPort = { name: "", dateOrDelay: "" };

export function emptyDraft(): ConsultationDraftInput {
  return {
    call: { callDate: "", callTime: "", atu: "", ccmmDoctor: "", careManager: "" },
    patient: {
      lastName: "",
      firstName: "",
      dateOfBirth: "",
      age: "",
      nationality: "",
      gender: "",
      registrationNumber: "",
      role: "",
    },
    vessel: {
      name: "",
      flag: "",
      type: "",
      allocation: "",
      allocationRestricted: false,
      owner: "",
      callSignMmsi: "",
      bridgePhone: "",
      infirmaryPhone: "",
      fax: "",
      email: "",
      telex: "",
      gpsCoordinates: "",
      position: "",
      originPort: { ...emptyPort },
      destination: { ...emptyPort },
      plannedCall: { ...emptyPort },
      possibleCall: { ...emptyPort },
    },
  };
}

/** Âge en années révolues à une date donnée (date de la consultation par défaut). */
export function computeAge(dateOfBirth: string, at: Date = new Date()): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return undefined;
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  let age = at.getFullYear() - y;
  if (at.getMonth() + 1 < m || (at.getMonth() + 1 === m && at.getDate() < d)) age -= 1;
  return age >= 0 && age <= 130 ? age : undefined;
}

/** Nettoie une recherche libre pour un filtre PostgREST (retire les caractères de syntaxe). */
export function sanitizeSearch(query: string | undefined | null): string {
  return (query ?? "")
    .replace(/[%_,()*\\"'.:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
