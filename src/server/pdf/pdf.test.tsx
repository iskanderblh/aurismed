import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { emptyDraft } from "@/lib/consultation/schema";
import { emptyFormData, type ObservationFormData } from "@/lib/medical/form-state";
import { emptyPrescription } from "@/lib/prescription/schema";
import { documentFileName, followUpRows, formatFieldValue, formatInstant, identification, observationSections } from "./model";
import { ObservationDocument } from "./observation-document";
import { PrescriptionDocument } from "./prescription-document";
import { FIELD_BY_PATH } from "@/lib/medical/catalog";

// Données entièrement fictives.
const draft = emptyDraft();
draft.patient.lastName = "Fictif";
draft.patient.firstName = "Jean";
draft.patient.dateOfBirth = "1980-05-12";
draft.vessel.name = "Navire Test";
draft.call.callDate = "2026-11-25";

const form: ObservationFormData = {
  ...emptyFormData(),
  fields: {
    "medical.abdominal.location": { value: "Fosse iliaque droite", status: "confirmed" },
    "medical.abdominal.vomiting": { value: false, status: "confirmed" },
    "medical.general.temperature": { value: 38.5, status: "confirmed" },
    "vitals.circ.systolic": { value: null, status: "not_mentioned" },
    "medical.chest.riskFactors": { value: ["tabac", "diabete"], status: "manual" },
    "decision.choice": { value: "soins_bord", status: "manual" },
    "decision.at": { value: "2026-11-25T14:30", status: "manual" },
  },
  bodyMarks: [{ id: "b1", view: "front", x: 0.3, y: 0.4, kind: "plaie", note: "Avant-bras 3 cm" }],
  followUps: [
    { id: "f", at: "2026-11-26T09:00", doctor: "Dr Test", systolic: 125, diastolic: 80, heartRate: 82, respRate: null, pain: 2, temperature: 37.2, glycemia: null, decision: "soins_bord", nextCall: "J+2", notes: "" },
  ],
  careChart: { columns: [{ id: "c1", at: "2026-11-25T16:00" }], cells: { "sv:fc:c1": "88", "soin:dressing:c1": "x", "rx:l1:c1": "1 cp" } },
};
const rx = { ...emptyPrescription(), lines: [{ id: "l1", name: "Paracétamol", dosage: "1 g", posology: "1 comprimé 3 fois par jour", durationDays: 3, problem: "Douleur" }], notes: "Rappeler si fièvre." };

// Lecture du texte des PDF avec poppler (pdftotext) ; vérification ignorée s'il est absent.
const HAS_PDFTOTEXT = !spawnSync("pdftotext", ["-v"]).error;
const text = (buf: Buffer) => {
  const dir = mkdtempSync(join(tmpdir(), "pdf-"));
  writeFileSync(join(dir, "f.pdf"), buf);
  return execFileSync("pdftotext", ["-layout", join(dir, "f.pdf"), "-"]).toString();
};

describe("mise en forme", () => {
  it("n'imprime que les champs renseignés, avec unités et libellés", () => {
    const sections = observationSections(form);
    const medical = sections.find((s) => s.key === "medical")!;
    const rows = medical.groups.flatMap((g) => g.rows);
    expect(rows).toContainEqual({ label: "Température", value: "38,5 °C" });
    expect(rows.find((r) => r.label.startsWith("Vomissements"))?.value).toBe("Non");
    expect(sections.find((s) => s.key === "vitals")!.groups).toEqual([]);
    expect(formatFieldValue(FIELD_BY_PATH.get("decision.at")!, "2026-11-25T14:30")).toBe("25/11/2026 à 14:30");
  });
  it("calcule l'âge à la date de consultation et formate le fuseau", () => {
    const id = identification(draft, new Date("2026-11-25"));
    expect(id.patient).toContainEqual({ label: "Âge", value: "46 ans" });
    expect(formatInstant("2026-11-25T13:30:00Z", "Europe/Paris")).toBe("25/11/2026 à 14:30");
    expect(formatInstant("2026-11-25T13:30:00Z", "Pas/UnFuseau")).toBe("25/11/2026 à 14:30");
    expect(followUpRows(form)[0]).toMatchObject({ number: 2, ta: "125/80", fr: "" });
  });
  it("produit un nom de fichier sûr", () => {
    expect(documentFileName("observation", "Le Bœuf-Hélène", "2026-11-25T10:00:00Z", 2)).toBe("fiche-observation_LE-B-UF-HELENE_2026-11-25_v2.pdf");
  });
});

describe.skipIf(!HAS_PDFTOTEXT)("rendu PDF", () => {
  it("fiche d'observation", { timeout: 30000 }, async () => {
    const buf = await renderToBuffer(
      ObservationDocument({ draft, form, prescription: rx, consultationDate: new Date("2026-11-25T10:00:00Z"), validatedAtLabel: "25/11/2026 à 15:00", doctorName: "Dr Test", version: 1 }),
    );
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    const t = text(buf);
    for (const s of ["FICHE D'OBSERVATION", "FICTIF", "Navire Test", "Fosse iliaque droite", "38,5 °C", "Paracétamol", "Soins à bord", "25/11/2026 à 14:30", "Avant-bras 3 cm", "FICHE DE SUIVI", "DIAGRAMME DE SOINS", "validée par Dr Test"]) {
      expect(t, s).toContain(s);
    }
    expect(t).not.toContain("Tension artérielle systolique");
  });
  it("ordonnance", { timeout: 30000 }, async () => {
    const buf = await renderToBuffer(
      PrescriptionDocument({
        prescription: rx,
        prescriber: { fullName: "Dr Test", specialty: "Médecine générale", rpps: "12345678901", phone: "", institutionName: "CCMM", institutionAddress: "", institutionPhone: "" },
        patientName: "Jean FICTIF",
        patientAge: 46,
        allergy: "Pénicilline",
        dateLabel: "25/11/2026",
        validatedAtLabel: "25/11/2026 à 15:00",
        version: 1,
      }),
    );
    const t = text(buf);
    for (const s of ["ORDONNANCE", "Dr Test", "RPPS : 12345678901", "Jean FICTIF", "46 ans", "Paracétamol 1 g", "1 comprimé 3 fois par jour", "Pendant 3 jours", "Pénicilline", "Rappeler si fièvre."]) {
      expect(t, s).toContain(s);
    }
  });
});
