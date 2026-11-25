"use client";

import { useState } from "react";
import { Check, Quote, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { optionLabel, type FieldDef } from "@/lib/medical/catalog";
import { isEmptyValue, type FieldState, type FieldValue } from "@/lib/medical/form-state";
import { quoteContext } from "@/lib/medical/quotes";
import { cn } from "@/lib/utils";

export const STATUS_META: Record<FieldState["status"], { label: string; variant: "success" | "warning" | "secondary" | "outline" | "default" }> = {
  extracted: { label: "Extrait par l'IA", variant: "default" },
  needs_verification: { label: "À vérifier", variant: "warning" },
  not_mentioned: { label: "Non mentionné", variant: "outline" },
  manual: { label: "Saisi par le médecin", variant: "secondary" },
  confirmed: { label: "Confirmé", variant: "success" },
};

const CONFIDENCE = { high: "élevée", medium: "moyenne", low: "faible" } as const;
const SPEAKER = { patient: "patient", doctor: "médecin", onboard_caregiver: "soignant à bord", unknown: "locuteur inconnu" } as const;
const KIND = { reported: "rapportée", observed: "observée", measured: "mesurée", instruction: "donnée comme consigne" } as const;

export function formatValue(field: FieldDef, value: FieldValue | null | undefined): string {
  if (isEmptyValue(value)) return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (Array.isArray(value)) return value.map((c) => optionLabel(field, c)).join(", ");
  if (field.type === "choice") return optionLabel(field, String(value));
  return `${value}${field.unit ? ` ${field.unit}` : ""}`;
}

/** Une ligne de la fiche : saisie typée, statut, provenance et actions de revue. */
export function FieldEditor({
  field,
  state,
  transcript,
  onChange,
  onAccept,
  onReject,
  onRestore,
}: {
  field: FieldDef;
  state: FieldState | undefined;
  transcript: string;
  onChange: (value: FieldValue | null) => void;
  onAccept: () => void;
  onReject: () => void;
  onRestore: () => void;
}) {
  const [showSource, setShowSource] = useState(false);
  const status = state?.status ?? "not_mentioned";
  const pending = status === "extracted" || status === "needs_verification";
  const meta = STATUS_META[status];
  const lowConfidence = pending && (status === "needs_verification" || state?.confidence !== "high");
  const inputId = `f-${field.path.replace(/\./g, "-")}`;
  const context = showSource && state?.source ? quoteContext(transcript, state.source) : null;
  const touchedAi = state && state.aiValue !== undefined && !pending;

  return (
    <div
      data-field={field.path}
      data-status={status}
      className={cn(
        "rounded-lg border p-3",
        lowConfidence && "border-amber-300 bg-amber-50/60",
        status === "extracted" && !lowConfidence && "border-primary/30 bg-primary/[0.03]",
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <label htmlFor={inputId} className="min-w-0 flex-1 text-sm font-medium">
          {field.label}
          {field.unit && <span className="font-normal text-muted-foreground"> ({field.unit})</span>}
        </label>
        <Badge variant={meta.variant}>{meta.label}</Badge>
        {pending && state?.confidence && (
          <Badge variant="outline" className={cn(state.confidence !== "high" && "border-amber-400 text-warning")}>
            Confiance {CONFIDENCE[state.confidence]}
          </Badge>
        )}
      </div>

      <div className="mt-2">
        <ValueInput id={inputId} field={field} value={state?.value ?? null} onChange={onChange} />
      </div>

      {(state?.notes?.length || state?.speaker || state?.kind) && pending ? (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {(state.speaker || state.kind) && (
            <li>
              Information {state.kind ? KIND[state.kind] : ""}
              {state.speaker ? ` · ${SPEAKER[state.speaker]}` : ""}
            </li>
          )}
          {state.notes?.map((n) => (
            <li key={n} className="text-warning">
              {n}
            </li>
          ))}
        </ul>
      ) : null}

      {touchedAi && (
        <p className="mt-2 text-xs text-muted-foreground">
          {state.rejected ? "Proposition rejetée" : "Proposition de l'IA"} : {formatValue(field, state.aiValue)}
          {state.rejected && (
            <button type="button" onClick={onRestore} className="ml-2 inline-flex items-center gap-1 underline">
              <Undo2 className="size-3" /> Rétablir
            </button>
          )}
        </p>
      )}

      {(pending || state?.source) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {pending && (
            <>
              <Button type="button" size="sm" variant="outline" onClick={onAccept} disabled={isEmptyValue(state?.value)}>
                <Check /> Accepter
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={onReject}>
                <X /> Rejeter
              </Button>
            </>
          )}
          {state?.source && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowSource((s) => !s)} aria-expanded={showSource}>
              <Quote /> {showSource ? "Masquer la source" : "Voir la source"}
            </Button>
          )}
        </div>
      )}

      {showSource && state?.source && (
        <blockquote className="mt-2 rounded-md bg-muted px-3 py-2 text-sm leading-relaxed">
          {context ? (
            <>
              <span className="text-muted-foreground">{context.before}</span>
              <mark className="rounded bg-amber-200 px-0.5">{context.match}</mark>
              <span className="text-muted-foreground">{context.after}</span>
            </>
          ) : (
            <>
              « {state.source} »
              <span className="mt-1 block text-xs text-warning">Cet extrait ne figure pas tel quel dans la transcription.</span>
            </>
          )}
        </blockquote>
      )}
    </div>
  );
}

function ValueInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: FieldDef;
  value: FieldValue | null;
  onChange: (v: FieldValue | null) => void;
}) {
  switch (field.type) {
    case "text":
      return <Input id={id} value={typeof value === "string" ? value : ""} maxLength={500} onChange={(e) => onChange(e.target.value || null)} />;
    case "longtext":
      return (
        <Textarea id={id} rows={3} value={typeof value === "string" ? value : ""} maxLength={20000} onChange={(e) => onChange(e.target.value || null)} />
      );
    case "number":
      return <NumberInput id={id} field={field} value={typeof value === "number" ? value : null} onChange={onChange} />;
    case "yesno":
      return (
        <Pills
          id={id}
          options={[
            { code: "true", label: "Oui" },
            { code: "false", label: "Non" },
          ]}
          selected={value === null ? [] : [String(value)]}
          onToggle={(c) => onChange(String(value) === c ? null : c === "true")}
        />
      );
    case "choice":
      return (
        <Pills
          id={id}
          options={field.options ?? []}
          selected={typeof value === "string" ? [value] : []}
          onToggle={(c) => onChange(value === c ? null : c)}
        />
      );
    case "multi": {
      const current = Array.isArray(value) ? value : [];
      return (
        <Pills
          id={id}
          multiple
          options={field.options ?? []}
          selected={current}
          onToggle={(c) => {
            const next = current.includes(c) ? current.filter((x) => x !== c) : [...current, c];
            onChange(next.length ? next : null);
          }}
        />
      );
    }
  }
}

function NumberInput({ id, field, value, onChange }: { id: string; field: FieldDef; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [committed, setCommitted] = useState(value);
  // Valeur modifiée de l'extérieur (acceptation, nouvelle analyse) : on resynchronise.
  if (committed !== value) {
    setCommitted(value);
    setText(value === null ? "" : String(value));
  }
  const parsed = text.trim() === "" ? null : Number(text.replace(",", "."));
  const invalid =
    parsed !== null &&
    (!Number.isFinite(parsed) || (field.min !== undefined && parsed < field.min) || (field.max !== undefined && parsed > field.max));
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        inputMode="decimal"
        className="max-w-40"
        value={text}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          const n = t.trim() === "" ? null : Number(t.replace(",", "."));
          const ok = n === null || (Number.isFinite(n) && (field.min === undefined || n >= field.min) && (field.max === undefined || n <= field.max));
          if (ok) {
            setCommitted(n);
            onChange(n);
          }
        }}
      />
      {field.unit && <span className="text-sm text-muted-foreground">{field.unit}</span>}
      {invalid && (
        <span className="text-xs text-destructive">
          Valeur attendue entre {field.min ?? "—"} et {field.max ?? "—"}
        </span>
      )}
    </div>
  );
}

function Pills({
  id,
  options,
  selected,
  onToggle,
  multiple,
}: {
  id: string;
  options: { code: string; label: string }[];
  selected: string[];
  onToggle: (code: string) => void;
  multiple?: boolean;
}) {
  return (
    <div id={id} role={multiple ? "group" : "radiogroup"} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.code);
        return (
          <button
            key={o.code}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={on}
            onClick={() => onToggle(o.code)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
