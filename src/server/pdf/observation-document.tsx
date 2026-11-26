import { Circle, Document, G, Page, Path, Svg, Text, View } from "@react-pdf/renderer";
import type { ConsultationDraftInput } from "@/lib/consultation/schema";
import { BODY_HEAD, BODY_MARK_COLORS, BODY_PATHS, BODY_VIEWBOX } from "@/lib/medical/body-shape";
import type { ObservationFormData } from "@/lib/medical/form-state";
import type { PrescriptionData } from "@/lib/prescription/schema";
import { CARE_ROWS, SURVEILLANCE_ROWS } from "@/lib/medical/care-chart";
import {
  bodyMarkLabel,
  careChartChunks,
  durationLabel,
  followUpRows,
  formatLocal,
  identification,
  observationSections,
  printableLines,
  type Section,
} from "./model";
import { Band, Footer, Rows, Table, s, NAVY, MUTED } from "./shared";

export type ObservationPdfInput = {
  draft: ConsultationDraftInput;
  form: ObservationFormData;
  prescription: PrescriptionData | null;
  consultationDate: Date;
  validatedAtLabel: string;
  doctorName: string;
  version: number;
};

function SectionBlock({ section }: { section: Section }) {
  return (
    <View>
      <Band>{section.title.toUpperCase()}</Band>
      {section.groups.length === 0 ? (
        <Text style={s.empty}>Non renseigné.</Text>
      ) : (
        section.groups.map((g) => (
          <View key={g.title}>
            <Text style={s.groupTitle} minPresenceAhead={20}>
              {g.title}
            </Text>
            <Rows rows={g.rows} />
          </View>
        ))
      )}
    </View>
  );
}

function BodyFigure({ form, view }: { form: ObservationFormData; view: "front" | "back" }) {
  const marks = form.bodyMarks.map((m, i) => ({ ...m, n: i + 1 })).filter((m) => m.view === view);
  return (
    <View style={{ alignItems: "center", width: 90 }}>
      <Svg width={80} height={176} viewBox={`0 0 ${BODY_VIEWBOX.width} ${BODY_VIEWBOX.height}`}>
        <G fill="#f1f5f9" stroke="#94a3b8" strokeWidth={0.8}>
          <Circle cx={BODY_HEAD.cx} cy={BODY_HEAD.cy} r={BODY_HEAD.r} />
          {BODY_PATHS.map((d) => (
            <Path key={d} d={d} />
          ))}
        </G>
        {marks.map((m) => (
          <Circle key={m.id} cx={m.x * 100} cy={m.y * 220} r={4.5} fill={BODY_MARK_COLORS[m.kind] ?? NAVY} stroke="white" strokeWidth={1} />
        ))}
      </Svg>
      <Text style={{ fontSize: 7.5, color: MUTED }}>{view === "front" ? "Face" : "Dos"}</Text>
      {/* Numéros des repères, dans l'ordre de la légende. */}
      <Text style={{ fontSize: 7, color: MUTED }}>{marks.map((m) => m.n).join(", ")}</Text>
    </View>
  );
}

export function ObservationDocument(input: ObservationPdfInput) {
  const { form, draft } = input;
  const id = identification(draft, input.consultationDate);
  const sections = observationSections(form);
  const bySection = (k: Section["key"]) => sections.find((x) => x.key === k)!;
  const lines = printableLines(input.prescription);
  const follow = followUpRows(form);
  const chunks = careChartChunks(form);
  const rxRows = lines.filter((l) => l.name.trim());
  const footer = `Fiche d'observation validée par ${input.doctorName || "le médecin"} le ${input.validatedAtLabel} · version ${input.version}`;

  return (
    <Document title="Fiche d'observation médicale" author={input.doctorName || "AurisMED"} creator="AurisMED" producer="AurisMED">
      <Page size="A4" style={s.page}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Text style={s.title}>FICHE D&apos;OBSERVATION MÉDICALE</Text>
            <Text style={s.subtitle}>Téléconsultation médicale maritime</Text>
          </View>
          <Text style={{ fontSize: 8, color: MUTED }}>Consultation du {formatLocal(input.consultationDate.toISOString().slice(0, 10))}</Text>
        </View>

        <Band>IDENTIFICATION</Band>
        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.groupTitle}>Appel</Text>
            {id.call.length ? <Rows rows={id.call} /> : <Text style={s.empty}>Non renseigné.</Text>}
            <Text style={s.groupTitle}>Patient</Text>
            {id.patient.length ? <Rows rows={id.patient} /> : <Text style={s.empty}>Non renseigné.</Text>}
          </View>
          <View style={s.col}>
            <Text style={s.groupTitle}>Navire</Text>
            {id.vessel.length ? <Rows rows={id.vessel} /> : <Text style={s.empty}>Non renseigné.</Text>}
          </View>
        </View>

        <SectionBlock section={bySection("history")} />
        <SectionBlock section={bySection("vitals")} />
        <SectionBlock section={bySection("trauma")} />
        {form.bodyMarks.length > 0 && (
          <View wrap={false}>
            <Text style={s.groupTitle}>Schéma des lésions</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <BodyFigure form={form} view="front" />
              <BodyFigure form={form} view="back" />
              <View style={{ flex: 1, paddingTop: 6 }}>
                {form.bodyMarks.map((m, i) => (
                  <Text key={m.id} style={{ fontSize: 8, marginBottom: 2 }}>
                    {i + 1}. {bodyMarkLabel(m.kind)} ({m.view === "front" ? "face" : "dos"}){m.note.trim() ? ` : ${m.note.trim()}` : ""}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        )}
        <SectionBlock section={bySection("medical")} />
        <SectionBlock section={bySection("exam")} />
        <SectionBlock section={bySection("teleconsultation")} />

        <Text style={s.groupTitle} minPresenceAhead={30}>
          Prescriptions
        </Text>
        {input.prescription?.noPrescription ? (
          <Text style={s.empty}>Aucun médicament prescrit.</Text>
        ) : rxRows.length ? (
          <Table
            head={["Nom / DCI", "Dosage", "Posologie", "Durée", "Problème"]}
            widths={[3, 1.5, 3, 1.2, 2]}
            rows={rxRows.map((l) => [l.name, l.dosage, l.posology, durationLabel(l.durationDays), l.problem])}
          />
        ) : (
          <Text style={s.empty}>Aucune ordonnance validée.</Text>
        )}

        <SectionBlock section={bySection("decision")} />

        {follow.length > 0 && (
          <View>
            <Band>FICHE DE SUIVI</Band>
            <Table
              head={["Appel", "Date", "Médecin", "TA", "FC", "FR", "EN", "T°", "Glyc.", "Décision", "Prochain appel"]}
              widths={[0.8, 1.8, 1.6, 1.1, 0.7, 0.7, 0.6, 0.7, 0.7, 2, 1.8]}
              rows={follow.map((f) => [`n° ${f.number}`, f.at, f.doctor, f.ta, f.fc, f.fr, f.en, f.temp, f.glycemia, f.decision, f.nextCall])}
            />
            {follow
              .filter((f) => f.notes)
              .map((f) => (
                <Text key={f.number} style={{ fontSize: 8, marginTop: 2 }}>
                  Appel n° {f.number} : {f.notes}
                </Text>
              ))}
          </View>
        )}

        <Footer left={footer} />
      </Page>

      {chunks.length > 0 && (
        <Page size="A4" orientation="landscape" style={s.page}>
          <Text style={s.title}>DIAGRAMME DE SOINS ET DE SURVEILLANCE</Text>
          <Text style={s.subtitle}>
            {[draft.patient.lastName?.toUpperCase(), draft.patient.firstName].filter(Boolean).join(" ") || "Patient non renseigné"}
            {(() => {
              const allergy = form.fields["history.drugAllergyDetail"]?.value;
              return typeof allergy === "string" && allergy ? ` · Allergie : ${allergy}` : "";
            })()}
          </Text>
          {chunks.map((cols, ci) => {
            const cell = (k: string, colId: string) => form.careChart.cells[`${k}:${colId}`] ?? "";
            const rowsFor = [
              ...rxRows.map((l) => [[l.name, l.dosage].filter(Boolean).join(" "), ...cols.map((c) => cell(`rx:${l.id}`, c.id))]),
              ...SURVEILLANCE_ROWS.map((r) => [r.label, ...cols.map((c) => cell(`sv:${r.key}`, c.id))]),
              ...CARE_ROWS.map((r) => [r.label, ...cols.map((c) => (cell(`soin:${r.key}`, c.id) === "x" ? "X" : ""))]),
            ];
            return (
              <View key={ci} style={{ marginTop: 8 }} wrap={false}>
                <Table head={["Heure / date", ...cols.map((c) => formatLocal(c.at))]} widths={[3, ...cols.map(() => 1.4)]} rows={rowsFor} />
              </View>
            );
          })}
          <Footer left={footer} />
        </Page>
      )}
    </Document>
  );
}
