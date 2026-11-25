import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { PrescriptionData } from "@/lib/prescription/schema";
import type { Prescriber } from "@/lib/data/prescriptions";
import { durationLabel, printableLines } from "./model";
import { Footer, s, NAVY, MUTED, BORDER } from "./shared";

export type PrescriptionPdfInput = {
  prescription: PrescriptionData;
  prescriber: Prescriber;
  patientName: string;
  patientAge?: number;
  allergy: string | null;
  dateLabel: string;
  validatedAtLabel: string;
  version: number;
};

/** Ordonnance : uniquement ce que le médecin a saisi et validé. */
export function PrescriptionDocument(input: PrescriptionPdfInput) {
  const p = input.prescriber;
  const lines = printableLines(input.prescription);
  return (
    <Document title="Ordonnance" author={p.fullName || "AurisMED"} creator="AurisMED" producer="AurisMED">
      <Page size="A4" style={[s.page, { fontSize: 10 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ maxWidth: "55%" }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12, color: NAVY }}>{p.fullName || "Médecin"}</Text>
            {p.specialty ? <Text>{p.specialty}</Text> : null}
            {p.rpps ? <Text style={{ color: MUTED }}>RPPS : {p.rpps}</Text> : null}
            {p.phone ? <Text style={{ color: MUTED }}>Tél. : {p.phone}</Text> : null}
          </View>
          <View style={{ maxWidth: "45%", alignItems: "flex-end" }}>
            {p.institutionName ? <Text style={{ fontFamily: "Helvetica-Bold" }}>{p.institutionName}</Text> : null}
            {p.institutionAddress ? <Text style={{ textAlign: "right", color: MUTED }}>{p.institutionAddress}</Text> : null}
            {p.institutionPhone ? <Text style={{ color: MUTED }}>Tél. : {p.institutionPhone}</Text> : null}
          </View>
        </View>

        <View style={{ marginTop: 24, borderTopWidth: 1, borderTopColor: NAVY, paddingTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11 }}>{input.patientName || "Patient"}</Text>
            {input.patientAge !== undefined ? <Text>{input.patientAge} ans</Text> : null}
          </View>
          <Text>Le {input.dateLabel}</Text>
        </View>

        {input.allergy ? (
          <Text style={{ marginTop: 8, color: "#b45309" }}>Allergie signalée : {input.allergy}</Text>
        ) : null}

        <Text style={{ marginTop: 22, marginBottom: 10, fontFamily: "Helvetica-Bold", fontSize: 13, color: NAVY, textAlign: "center", letterSpacing: 1 }}>
          ORDONNANCE
        </Text>

        {lines.map((l, i) => (
          <View key={l.id} style={{ marginBottom: 10, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: BORDER }} wrap={false}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>
              {i + 1}. {l.name}
              {l.dosage ? ` ${l.dosage}` : ""}
            </Text>
            <Text style={{ marginLeft: 12 }}>{l.posology}</Text>
            <Text style={{ marginLeft: 12, color: MUTED }}>
              {[l.durationDays !== null ? `Pendant ${durationLabel(l.durationDays)}` : "", l.problem ? `Motif : ${l.problem}` : ""].filter(Boolean).join(" · ")}
            </Text>
          </View>
        ))}

        {input.prescription.notes.trim() ? (
          <View style={{ marginTop: 6 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Consignes</Text>
            <Text>{input.prescription.notes.trim()}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 36, alignSelf: "flex-end", width: 200 }} wrap={false}>
          <Text style={{ color: MUTED, marginBottom: 40 }}>Signature du médecin</Text>
          <Text style={{ borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 2 }}>{p.fullName}</Text>
        </View>

        <Footer left={`Ordonnance validée par le médecin le ${input.validatedAtLabel} · version ${input.version}`} />
      </Page>
    </Document>
  );
}
