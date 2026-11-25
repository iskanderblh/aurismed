import { describe, expect, it } from "vitest";
import { emptyPrescription, linesFromMedications, prescriptionIssues, prescriptionSchema, type PrescriptionLine } from "./schema";
import type { MedicationLine } from "@/lib/medical/form-state";

const line = (p: Partial<PrescriptionLine> = {}): PrescriptionLine => ({
  id: "l1", name: "Paracétamol", dosage: "1 g", posology: "3 fois par jour", durationDays: 5, problem: "Douleur", ...p,
});
const med = (p: Partial<MedicationLine>): MedicationLine => ({
  id: "m1", name: "Paracétamol", dosage: "", posology: "", durationDays: null, indication: "", origin: "ai", status: "accepted", ...p,
});

describe("ordonnance", () => {
  it("refuse une ordonnance vide sans mention explicite", () => {
    expect(prescriptionIssues(emptyPrescription())).toHaveLength(1);
    expect(prescriptionIssues({ ...emptyPrescription(), noPrescription: true })).toEqual([]);
  });
  it("exige dosage, posologie et durée saisis par le médecin", () => {
    const issues = prescriptionIssues({ ...emptyPrescription(), lines: [line({ dosage: "", durationDays: null })] });
    expect(issues[0]).toMatch(/dosage, durée/);
    expect(prescriptionIssues({ ...emptyPrescription(), lines: [line()] })).toEqual([]);
  });
  it("ignore les lignes vierges", () => {
    const blank = line({ id: "b", name: "", dosage: "", posology: "", durationDays: null, problem: "" });
    expect(prescriptionIssues({ ...emptyPrescription(), lines: [line(), blank] })).toEqual([]);
  });
  it("refuse « aucun médicament » avec des lignes", () => {
    expect(prescriptionIssues({ ...emptyPrescription(), noPrescription: true, lines: [line()] })).toHaveLength(1);
  });
  it("reprend seulement les médicaments acceptés, sans inventer de dosage, une seule fois", () => {
    let n = 0;
    const meds = [med({}), med({ id: "m2", name: "Ibuprofène", status: "proposed" }), med({ id: "m3", name: "Amoxicilline", status: "rejected" })];
    const lines = linesFromMedications(meds, [], () => `n${++n}`);
    expect(lines).toEqual([{ id: "n1", name: "Paracétamol", dosage: "", posology: "", durationDays: null, problem: "", fromMedicationId: "m1" }]);
    expect(linesFromMedications(meds, lines, () => "x")).toEqual([]);
  });
  it("valide la structure", () => {
    expect(prescriptionSchema.safeParse({ ...emptyPrescription(), lines: [line({ durationDays: -1 })] }).success).toBe(false);
  });
});
