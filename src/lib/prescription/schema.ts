import { z } from "zod";
import type { MedicationLine } from "@/lib/medical/form-state";

/**
 * Ordonnance : rédigée et validée par le médecin. L'application ne propose
 * jamais de dosage ni de posologie ; elle peut seulement reprendre, sur action
 * du médecin, les médicaments qu'il a acceptés dans la fiche.
 */
export type PrescriptionLine = {
  id: string;
  name: string;
  dosage: string;
  posology: string;
  durationDays: number | null;
  problem: string;
  /** Ligne reprise d'un médicament de la fiche (traçabilité). */
  fromMedicationId?: string;
};

export type PrescriptionData = {
  version: 1;
  lines: PrescriptionLine[];
  notes: string;
  /** Le médecin indique explicitement qu'aucun médicament n'est prescrit. */
  noPrescription: boolean;
};

export const emptyPrescription = (): PrescriptionData => ({ version: 1, lines: [], notes: "", noPrescription: false });

const lineSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(200),
  dosage: z.string().max(200),
  posology: z.string().max(500),
  durationDays: z.number().int().min(0).max(3650).nullable(),
  problem: z.string().max(300),
  fromMedicationId: z.string().max(64).optional(),
});

export const prescriptionSchema = z.object({
  version: z.literal(1),
  lines: z.array(lineSchema).max(30),
  notes: z.string().max(4000),
  noPrescription: z.boolean(),
});

/** Ligne commencée : au moins un champ renseigné. */
export const isStartedLine = (l: PrescriptionLine) =>
  Boolean(l.name.trim() || l.dosage.trim() || l.posology.trim() || l.problem.trim() || l.durationDays !== null);

/** Problèmes bloquant la validation, en clair. Liste vide : ordonnance validable. */
export function prescriptionIssues(data: PrescriptionData): string[] {
  const lines = data.lines.filter(isStartedLine);
  if (data.noPrescription) return lines.length ? ["Retirez les lignes ou décochez « Aucun médicament prescrit »."] : [];
  if (!lines.length) return ["Ajoutez au moins un médicament, ou indiquez qu'aucun médicament n'est prescrit."];
  const issues: string[] = [];
  lines.forEach((l, i) => {
    const missing = [
      !l.name.trim() && "nom / DCI",
      !l.dosage.trim() && "dosage",
      !l.posology.trim() && "posologie",
      l.durationDays === null && "durée",
    ].filter(Boolean);
    if (missing.length) issues.push(`Ligne ${i + 1}${l.name.trim() ? ` (${l.name.trim()})` : ""} : ${missing.join(", ")} à compléter.`);
  });
  return issues;
}

/** Lignes d'ordonnance reprises des médicaments acceptés (les champs vides restent vides). */
export function linesFromMedications(meds: MedicationLine[], existing: PrescriptionLine[], newId: () => string): PrescriptionLine[] {
  const taken = new Set(existing.map((l) => l.fromMedicationId).filter(Boolean));
  return meds
    .filter((m) => m.status === "accepted" && m.name.trim() && !taken.has(m.id))
    .map((m) => ({
      id: newId(),
      name: m.name.trim(),
      dosage: m.dosage.trim(),
      posology: m.posology.trim(),
      durationDays: m.durationDays,
      problem: m.indication.trim(),
      fromMedicationId: m.id,
    }));
}
