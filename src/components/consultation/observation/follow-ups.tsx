"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DECISION_OPTIONS } from "@/lib/medical/catalog";
import type { FollowUpCall } from "@/lib/medical/form-state";
import { cn } from "@/lib/utils";
import { nowLocal } from "./field-editor";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `f-${Date.now()}`);

type NumKey = "systolic" | "diastolic" | "heartRate" | "respRate" | "pain" | "temperature" | "glycemia";
const VITALS: { key: NumKey; label: string; unit: string; min: number; max: number; step?: string }[] = [
  { key: "systolic", label: "TA systolique", unit: "mmHg", min: 30, max: 300 },
  { key: "diastolic", label: "TA diastolique", unit: "mmHg", min: 10, max: 200 },
  { key: "heartRate", label: "FC", unit: "/min", min: 10, max: 300 },
  { key: "respRate", label: "FR", unit: "/min", min: 0, max: 80 },
  { key: "pain", label: "EN", unit: "/10", min: 0, max: 10 },
  { key: "temperature", label: "T°", unit: "°C", min: 30, max: 45, step: "0.1" },
  { key: "glycemia", label: "Glycémie", unit: "g/L", min: 0, max: 10, step: "0.01" },
];

/** Fiche de suivi (pages 7 et 8) : appels n° 2 et suivants, saisis par le médecin. */
export function FollowUps({ calls, defaultDoctor, onChange }: { calls: FollowUpCall[]; defaultDoctor: string; onChange: (c: FollowUpCall[]) => void }) {
  const update = (id: string, patch: Partial<FollowUpCall>) => onChange(calls.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-3">
      {calls.length === 0 && <p className="text-sm text-muted-foreground">Aucun appel de suivi enregistré.</p>}
      {calls.map((c, i) => (
        <fieldset key={c.id} data-follow-up={i + 2} className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <legend className="font-medium">Appel n° {i + 2}</legend>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto"
              aria-label={`Supprimer l'appel n° ${i + 2}`}
              onClick={() => onChange(calls.filter((x) => x.id !== c.id))}
            >
              <Trash2 />
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Date et heure</span>
              <Input type="datetime-local" value={c.at ?? ""} onChange={(e) => update(c.id, { at: e.target.value ? e.target.value.slice(0, 16) : null })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Médecin</span>
              <Input value={c.doctor} maxLength={200} onChange={(e) => update(c.id, { doctor: e.target.value })} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {VITALS.map((v) => (
              <VitalInput key={v.key} def={v} value={c[v.key]} onChange={(n) => update(c.id, { [v.key]: n })} />
            ))}
          </div>
          <div role="radiogroup" aria-label={`Décision de l'appel n° ${i + 2}`} className="flex flex-wrap gap-1.5">
            {DECISION_OPTIONS.map((o) => (
              <button
                key={o.code}
                type="button"
                role="radio"
                aria-checked={c.decision === o.code}
                onClick={() => update(c.id, { decision: c.decision === o.code ? null : o.code })}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  c.decision === o.code ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">RDV pour le prochain appel</span>
              <Input value={c.nextCall} maxLength={300} onChange={(e) => update(c.id, { nextCall: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Observations</span>
              <Textarea rows={2} value={c.notes} maxLength={2000} onChange={(e) => update(c.id, { notes: e.target.value })} />
            </label>
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={calls.length >= 20}
        onClick={() =>
          onChange([
            ...calls,
            {
              id: newId(), at: nowLocal(), doctor: defaultDoctor, systolic: null, diastolic: null, heartRate: null, respRate: null,
              pain: null, temperature: null, glycemia: null, decision: null, nextCall: "", notes: "",
            },
          ])
        }
      >
        <Plus /> Ajouter un appel de suivi
      </Button>
    </div>
  );
}

/** Champ numérique borné : une valeur hors limites est signalée et non enregistrée. */
export function VitalInput({
  def,
  value,
  onChange,
  compact,
}: {
  def: { label: string; unit: string; min: number; max: number; step?: string };
  value: number | null;
  onChange: (n: number | null) => void;
  compact?: boolean;
}) {
  return (
    <label className="space-y-1">
      {!compact && (
        <span className="text-xs text-muted-foreground">
          {def.label} ({def.unit})
        </span>
      )}
      <Input
        type="number"
        inputMode="decimal"
        min={def.min}
        max={def.max}
        step={def.step ?? "1"}
        aria-label={compact ? `${def.label} (${def.unit})` : undefined}
        defaultValue={value ?? ""}
        onChange={(e) => {
          const t = e.target.value;
          if (t === "") return onChange(null);
          const n = Number(t);
          const ok = Number.isFinite(n) && n >= def.min && n <= def.max;
          e.target.setCustomValidity(ok ? "" : `Entre ${def.min} et ${def.max}`);
          if (ok) onChange(n);
        }}
        className="invalid:border-destructive"
      />
    </label>
  );
}
