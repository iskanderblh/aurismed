import { describe, expect, it } from "vitest";
import { computeAge, consultationDraftSchema, emptyDraft, sanitizeSearch } from "./schema";
import { draftToRow, rowToDraft } from "./mapping";

// Données synthétiques uniquement.
function sample() {
  const d = emptyDraft();
  d.call = { ...d.call, callDate: "2026-11-24", callTime: "14:30", atu: "ATU-TEST-01" };
  d.patient = { ...d.patient, lastName: "Testeur", firstName: "Alex", dateOfBirth: "1990-05-15", age: "36", gender: "M", role: "Matelot" };
  d.vessel = {
    ...d.vessel,
    name: "Navire Exemple",
    allocation: "B",
    allocationRestricted: true,
    email: "bord@example.test",
    destination: { name: "Port Fictif", dateOrDelay: "J+2" },
  };
  return d;
}

describe("computeAge", () => {
  it("compte les années révolues", () => {
    expect(computeAge("1990-05-15", new Date(2026, 4, 14))).toBe(35);
    expect(computeAge("1990-05-15", new Date(2026, 4, 15))).toBe(36);
  });
  it("rejette les dates invalides ou futures", () => {
    expect(computeAge("15/05/1990")).toBeUndefined();
    expect(computeAge("2999-01-01", new Date(2026, 0, 1))).toBeUndefined();
  });
});

describe("consultationDraftSchema", () => {
  it("accepte un brouillon vide", () => {
    const parsed = consultationDraftSchema.parse(emptyDraft());
    expect(parsed.patient.lastName).toBeUndefined();
    expect(parsed.patient.age).toBeUndefined();
  });

  it("valide et convertit les champs", () => {
    const parsed = consultationDraftSchema.parse(sample());
    expect(parsed.patient.age).toBe(36);
    expect(parsed.vessel.allocation).toBe("B");
  });

  it("signale les valeurs invalides avec leur chemin", () => {
    const d = sample();
    d.patient.age = "-3";
    d.vessel.email = "pas-un-email";
    d.call.callTime = "25h";
    const result = consultationDraftSchema.safeParse(d);
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["patient.age", "vessel.email", "call.callTime"]));
  });

  it("refuse une date de naissance future", () => {
    const d = sample();
    d.patient.dateOfBirth = "2999-01-01";
    expect(consultationDraftSchema.safeParse(d).success).toBe(false);
  });
});

describe("mapping", () => {
  it("fait l'aller-retour formulaire -> base -> formulaire sans perte", () => {
    const input = sample();
    const row = draftToRow(consultationDraftSchema.parse(input));
    expect(row.patient_name).toBe("Testeur");
    expect(row.patient_gender).toBe("M");
    // Les champs vides ne sont pas stockés.
    expect(row.vessel_information).not.toHaveProperty("fax");
    expect(row.vessel_information).not.toHaveProperty("originPort");
    const back = rowToDraft({
      patient_name: row.patient_name!,
      patient_first_name: row.patient_first_name!,
      patient_date_of_birth: row.patient_date_of_birth!,
      patient_gender: row.patient_gender!,
      patient_information: row.patient_information!,
      vessel_information: row.vessel_information!,
      call_information: row.call_information!,
    });
    expect(back).toEqual(input);
  });

  it("efface une valeur vidée par le médecin", () => {
    const d = sample();
    d.patient.lastName = "";
    expect(draftToRow(consultationDraftSchema.parse(d)).patient_name).toBeNull();
  });
});

describe("sanitizeSearch", () => {
  it("retire la syntaxe PostgREST", () => {
    expect(sanitizeSearch("dupont,patient_name.eq.x)")).toBe("dupont patient name eq x");
    expect(sanitizeSearch("  Léa   Martin ")).toBe("Léa Martin");
    expect(sanitizeSearch(null)).toBe("");
  });
});
