"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CareChart as Chart } from "@/lib/medical/form-state";
import type { PrescriptionLine } from "@/lib/prescription/schema";
import { formatLocalDateTime, nowLocal } from "./field-editor";

export const SURVEILLANCE_ROWS = [
  { key: "ta", label: "Tension artérielle" },
  { key: "fc", label: "Fréquence cardiaque (/min)" },
  { key: "fr", label: "Fréquence respiratoire (/min)" },
  { key: "temp", label: "Température (°C)" },
  { key: "pain", label: "Douleur EN (/10)" },
  { key: "glycemia", label: "Glycémie (g/L)" },
  { key: "diuresis", label: "Diurèse (ml)" },
  { key: "stools", label: "Selles" },
] as const;

export const CARE_ROWS = [
  { key: "dressing", label: "Pansement / Désinfection" },
  { key: "suture", label: "Suture / Agrafes" },
  { key: "injection", label: "Injection" },
  { key: "ecg", label: "ECG" },
  { key: "bu", label: "Bandelette urinaire" },
  { key: "malaria", label: "Test paludisme" },
  { key: "photo", label: "Photo" },
  { key: "advice", label: "Consultation / Avis médical" },
] as const;

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c-${Date.now()}`);

/**
 * Diagramme de soins et de surveillance (page 9) : une colonne par heure de
 * relevé, les lignes de l'ordonnance, les paramètres et les soins réalisés.
 */
export function CareChart({ chart, prescriptionLines, onChange }: { chart: Chart; prescriptionLines: PrescriptionLine[]; onChange: (c: Chart) => void }) {
  const setCell = (key: string, value: string) => {
    const cells = { ...chart.cells };
    if (value) cells[key] = value.slice(0, 100);
    else delete cells[key];
    onChange({ ...chart, cells });
  };
  const addColumn = () => onChange({ ...chart, columns: [...chart.columns, { id: newId(), at: nowLocal() }] });
  const removeColumn = (id: string) =>
    onChange({
      columns: chart.columns.filter((c) => c.id !== id),
      cells: Object.fromEntries(Object.entries(chart.cells).filter(([k]) => !k.endsWith(`:${id}`))),
    });
  const rx = prescriptionLines.filter((l) => l.name.trim());

  if (!chart.columns.length) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Ajoutez une colonne pour chaque relevé (heure et date) réalisé à bord.</p>
        <Button type="button" variant="outline" size="sm" onClick={addColumn}>
          <Plus /> Ajouter un relevé
        </Button>
      </div>
    );
  }

  const section = (title: string) => (
    <tr>
      <th colSpan={chart.columns.length + 1} className="bg-muted px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide">
        {title}
      </th>
    </tr>
  );
  const textRow = (key: string, label: string) => (
    <tr key={key}>
      <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-1 text-left text-xs font-normal">
        {label}
      </th>
      {chart.columns.map((c) => (
        <td key={c.id} className="border-l p-0.5">
          <input
            aria-label={`${label}, ${formatLocalDateTime(c.at)}`}
            className="h-8 w-full min-w-16 rounded bg-transparent px-1.5 text-sm focus:bg-muted focus:outline-none"
            maxLength={100}
            value={chart.cells[`${key}:${c.id}`] ?? ""}
            onChange={(e) => setCell(`${key}:${c.id}`, e.target.value)}
          />
        </td>
      ))}
    </tr>
  );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm" data-testid="care-chart">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-48 bg-card px-2 py-1 text-left text-xs text-muted-foreground">Heure / date</th>
              {chart.columns.map((c) => (
                <th key={c.id} className="border-l p-1 align-top">
                  <div className="flex items-center gap-1">
                    <input
                      type="datetime-local"
                      aria-label="Heure et date du relevé"
                      className="h-8 rounded border bg-card px-1 text-xs"
                      value={c.at}
                      onChange={(e) =>
                        e.target.value &&
                        onChange({ ...chart, columns: chart.columns.map((x) => (x.id === c.id ? { ...x, at: e.target.value.slice(0, 16) } : x)) })
                      }
                    />
                    <button type="button" aria-label="Supprimer ce relevé" className="text-muted-foreground hover:text-destructive" onClick={() => removeColumn(c.id)}>
                      <X className="size-3.5" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section("Prescriptions")}
            {rx.length === 0 ? (
              <tr>
                <td colSpan={chart.columns.length + 1} className="px-2 py-1 text-xs text-muted-foreground">
                  Les médicaments de l&apos;ordonnance apparaîtront ici.
                </td>
              </tr>
            ) : (
              rx.map((l) => textRow(`rx:${l.id}`, [l.name, l.dosage].filter(Boolean).join(" ")))
            )}
            {section("Surveillance")}
            {SURVEILLANCE_ROWS.map((r) => textRow(`sv:${r.key}`, r.label))}
            {section("Soins / examens complémentaires")}
            {CARE_ROWS.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-1 text-left text-xs font-normal">
                  {r.label}
                </th>
                {chart.columns.map((c) => {
                  const key = `soin:${r.key}:${c.id}`;
                  return (
                    <td key={c.id} className="border-l text-center">
                      <input
                        type="checkbox"
                        aria-label={`${r.label}, ${formatLocalDateTime(c.at)}`}
                        className="size-4 accent-[var(--primary)]"
                        checked={chart.cells[key] === "x"}
                        onChange={(e) => setCell(key, e.target.checked ? "x" : "")}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addColumn} disabled={chart.columns.length >= 60}>
        <Plus /> Ajouter un relevé
      </Button>
    </div>
  );
}
