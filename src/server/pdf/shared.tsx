import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Row } from "./model";

export const NAVY = "#0b2a5b";
export const LIGHT = "#dbe7f7";
export const MUTED = "#5b6b82";
export const BORDER = "#c7d2e0";

export const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 46, paddingHorizontal: 30, fontSize: 9, fontFamily: "Helvetica", color: "#111827" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", color: NAVY },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 2 },
  band: { backgroundColor: NAVY, color: "white", fontFamily: "Helvetica-Bold", fontSize: 9.5, paddingVertical: 3, paddingHorizontal: 6, marginTop: 10, marginBottom: 4 },
  groupTitle: { backgroundColor: LIGHT, color: NAVY, fontFamily: "Helvetica-Bold", fontSize: 8.5, paddingVertical: 2, paddingHorizontal: 5, marginTop: 5, marginBottom: 2 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER, paddingVertical: 2 },
  label: { width: "38%", color: MUTED, paddingRight: 6 },
  value: { width: "62%" },
  empty: { color: MUTED, fontStyle: "italic", fontSize: 8.5, marginVertical: 2 },
  footer: { position: "absolute", bottom: 18, left: 30, right: 30, fontSize: 7.5, color: MUTED, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 4 },
  cols: { flexDirection: "row", gap: 12 },
  col: { flex: 1 },
  th: { fontFamily: "Helvetica-Bold", backgroundColor: LIGHT, color: NAVY, fontSize: 7.5, padding: 2.5, borderRightWidth: 0.5, borderRightColor: BORDER },
  td: { fontSize: 8, padding: 2.5, borderRightWidth: 0.5, borderRightColor: BORDER },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: BORDER },
  table: { borderWidth: 0.5, borderColor: BORDER, borderRightWidth: 0 },
});

export function Rows({ rows }: { rows: Row[] }) {
  return (
    <View>
      {rows.map((r) => (
        <View key={r.label} style={s.row} wrap={false}>
          <Text style={s.label}>{r.label}</Text>
          <Text style={s.value}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function Band({ children }: { children: string }) {
  return (
    <Text style={s.band} minPresenceAhead={40}>
      {children}
    </Text>
  );
}

/** Tableau simple à colonnes proportionnelles. */
export function Table({ head, rows, widths }: { head: string[]; rows: string[][]; widths: number[] }) {
  const total = widths.reduce((a, b) => a + b, 0);
  const w = (i: number) => `${(widths[i] / total) * 100}%`;
  return (
    <View style={s.table}>
      <View style={s.tr} fixed>
        {head.map((h, i) => (
          <Text key={i} style={[s.th, { width: w(i) }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, j) => (
        <View key={j} style={s.tr} wrap={false}>
          {r.map((c, i) => (
            <Text key={i} style={[s.td, { width: w(i) }]}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function Footer({ left }: { left: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{left}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`} />
    </View>
  );
}
