"use client";

import { useState } from "react";
import { AlertTriangle, Check, Plus, Quote, Search, Trash2, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SymptomAttrs, SymptomPresence, SymptomState } from "@/lib/medical/form-state";
import { quoteContext } from "@/lib/medical/quotes";
import { PRESENCE_LABEL, resolveSymptomConflict } from "@/lib/urology/symptoms";
import { ATTRIBUTE_LABEL, CATEGORIES, searchSymptoms, type SymptomDef } from "@/lib/urology/taxonomy";
import { cn } from "@/lib/utils";
import { STATUS_META, clock } from "./field-editor";

const SPEAKER = { patient: "patient", doctor: "médecin", onboard_caregiver: "soignant", unknown: "locuteur inconnu" } as const;
const PRESENCES: SymptomPresence[] = ["yes", "no", "uncertain"];

/**
 * Symptômes urologiques : proposés par l'IA (avec l'expression d'origine et la
 * réplique citée) ou ajoutés par le médecin depuis la taxonomie. Le médecin
 * accepte, corrige, rejette et tranche les contradictions.
 */
export function SymptomsPanel({
  symptoms,
  taxonomy,
  transcript,
  onChange,
}: {
  symptoms: Record<string, SymptomState>;
  taxonomy: SymptomDef[];
  transcript: string;
  onChange: (next: Record<string, SymptomState>) => void;
}) {
  const [query, setQuery] = useState("");
  const byId = new Map(taxonomy.map((t) => [t.id, t]));
  const set = (id: string, state: SymptomState | undefined) => {
    const next = { ...symptoms };
    if (state) next[id] = state;
    else delete next[id];
    onChange(next);
  };
  const results = searchSymptoms(query, taxonomy).filter((x) => !symptoms[x.id]);
  const entries = Object.entries(symptoms);

  return (
    <div className="space-y-4">
      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun symptôme documenté. Les symptômes cités pendant la consultation apparaîtront ici ; vous pouvez aussi les ajouter.
        </p>
      )}
      {CATEGORIES.map((cat) => {
        const items = entries.filter(([id]) => (byId.get(id)?.category ?? "custom") === cat.key);
        if (!items.length) return null;
        return (
          <div key={cat.key} className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat.title}</h4>
            <div className="grid gap-2 @2xl:grid-cols-2">
              {items.map(([id, state]) => (
                <SymptomCard key={id} id={id} def={byId.get(id)} state={state} transcript={transcript} onChange={(s) => set(id, s)} />
              ))}
            </div>
          </div>
        );
      })}

      <div className="rounded-lg border border-dashed p-3">
        <label htmlFor="symptom-search" className="flex items-center gap-2 text-sm font-medium">
          <Search className="size-4" /> Ajouter un symptôme
        </label>
        <Input
          id="symptom-search"
          className="mt-2"
          placeholder="Nom, terme médical ou expression du patient (ex. « mal aux reins »)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 && (
          <ul className="mt-2 max-h-56 divide-y overflow-y-auto rounded-md border">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    set(r.id, { presence: "yes", status: "manual", attrs: {} });
                    setQuery("");
                  }}
                >
                  <Plus className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {CATEGORIES.find((c) => c.key === r.category)?.title}
                      {r.synonyms.length ? ` · ${r.synonyms.slice(0, 3).join(", ")}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SymptomCard({
  id,
  def,
  state,
  transcript,
  onChange,
}: {
  id: string;
  def: SymptomDef | undefined;
  state: SymptomState;
  transcript: string;
  onChange: (s: SymptomState | undefined) => void;
}) {
  const [showSource, setShowSource] = useState(false);
  const pending = state.status === "extracted" || state.status === "needs_verification";
  const attributes = def?.attributes ?? ["details"];
  const context = showSource && state.source ? quoteContext(transcript, state.source) : null;
  const manual = (patch: Partial<SymptomState>) =>
    onChange({ ...state, ...patch, status: "manual", aiPresence: state.aiPresence ?? (pending ? state.presence : undefined) });
  const meta = STATUS_META[state.status];

  return (
    <div
      data-symptom={id}
      data-status={state.status}
      data-presence={state.presence}
      data-conflicts={state.conflicts?.length ?? 0}
      className={cn(
        "rounded-lg border p-3",
        state.rejected && "opacity-60",
        pending && (state.status === "needs_verification" || state.confidence !== "high") && "border-amber-300 bg-amber-50/60",
        state.status === "extracted" && state.confidence === "high" && "border-primary/30 bg-primary/[0.03]",
        Boolean(state.conflicts?.length) && "border-red-300 bg-red-50/50",
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{def?.name ?? id}</p>
          {def && def.term !== def.name && <p className="text-xs text-muted-foreground">{def.term}</p>}
        </div>
        <Badge variant={state.rejected ? "outline" : meta.variant}>{state.rejected ? "Rejeté" : meta.label}</Badge>
      </div>

      <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={`Présence : ${def?.name ?? id}`}>
        {PRESENCES.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={state.presence === p}
            disabled={state.rejected}
            onClick={() => manual({ presence: p })}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs",
              state.presence === p ? (p === "yes" ? "border-primary bg-primary text-primary-foreground" : "border-foreground/40 bg-muted font-medium") : "hover:bg-muted",
            )}
          >
            {PRESENCE_LABEL[p]}
          </button>
        ))}
      </div>

      {state.expression && <p className="mt-2 text-xs italic text-muted-foreground">« {state.expression} »</p>}

      {!state.rejected && (
        <div className="mt-2 grid gap-2 @md:grid-cols-2">
          {attributes.map((a) => (
            <label key={a} className="text-xs">
              <span className="text-muted-foreground">{ATTRIBUTE_LABEL[a]}</span>
              <Input
                className="mt-0.5 h-8 text-sm"
                value={state.attrs[a] ?? ""}
                maxLength={1000}
                onChange={(e) => {
                  const attrs: SymptomAttrs = { ...state.attrs, [a]: e.target.value };
                  if (!e.target.value) delete attrs[a];
                  manual({ attrs });
                }}
              />
            </label>
          ))}
        </div>
      )}

      {pending && (state.speaker || state.sourceAt !== undefined || state.notes?.length) ? (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          <li>
            {state.speaker ? `Dit par : ${SPEAKER[state.speaker]}` : ""}
            {state.sourceAt !== undefined ? ` · à ${clock(state.sourceAt)} de l'enregistrement` : ""}
          </li>
          {state.notes?.map((n) => (
            <li key={n} className="text-warning">
              {n}
            </li>
          ))}
        </ul>
      ) : null}

      {state.conflicts?.map((c, i) => (
        <div key={i} className="mt-2 rounded-md border border-red-200 bg-white p-2 text-sm" data-conflict>
          <p className="flex items-start gap-1.5 font-medium text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Information contradictoire :{" "}
            {[c.presence ? PRESENCE_LABEL[c.presence] : null, ...Object.entries(c.attrs ?? {}).map(([k, v]) => `${ATTRIBUTE_LABEL[k as keyof typeof ATTRIBUTE_LABEL] ?? k} : ${v}`)]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            « {c.source} »{c.speaker ? ` · ${SPEAKER[c.speaker]}` : ""}
            {c.sourceAt !== undefined ? ` · à ${clock(c.sourceAt)}` : ""}. Le symptôme n&apos;a pas été changé.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onChange(resolveSymptomConflict(state, i, "new"))}>
              Utiliser cette information
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(resolveSymptomConflict(state, i, "current"))}>
              Garder l&apos;actuelle
            </Button>
          </div>
        </div>
      ))}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {pending && !state.rejected && (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...state, status: "confirmed", aiPresence: state.presence, notes: undefined })}>
              <Check /> Accepter
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...state, status: "manual", rejected: true, aiPresence: state.presence })}>
              <X /> Rejeter
            </Button>
          </>
        )}
        {state.rejected && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...state, rejected: undefined, status: "needs_verification" })}>
            <Undo2 /> Rétablir
          </Button>
        )}
        {state.aiPresence === undefined && !pending && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(undefined)}>
            <Trash2 /> Retirer
          </Button>
        )}
        {state.source && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowSource((v) => !v)} aria-expanded={showSource}>
            <Quote /> {showSource ? "Masquer la source" : "Voir la source"}
          </Button>
        )}
      </div>
      {showSource && state.source && (
        <blockquote className="mt-2 rounded-md bg-muted px-3 py-2 text-sm leading-relaxed">
          {context ? (
            <>
              <span className="text-muted-foreground">{context.before}</span>
              <mark className="rounded bg-amber-200 px-0.5">{context.match}</mark>
              <span className="text-muted-foreground">{context.after}</span>
            </>
          ) : (
            <>« {state.source} »</>
          )}
        </blockquote>
      )}
    </div>
  );
}
