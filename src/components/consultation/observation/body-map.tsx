"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BODY_MARK_KINDS, type BodyMark, type BodyMarkKind } from "@/lib/medical/form-state";
import { cn } from "@/lib/utils";
import { BODY_HEAD, BODY_MARK_COLORS, BODY_PATHS } from "@/lib/medical/body-shape";

const COLORS = BODY_MARK_COLORS as Record<BodyMarkKind, string>;

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `b-${Date.now()}`);

function Silhouette() {
  return (
    <g fill="#f1f5f9" stroke="#94a3b8" strokeWidth="0.8">
      <circle {...BODY_HEAD} />
      {BODY_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  );
}

/**
 * Schéma corporel de la page 3 : un clic pose une annotation (douleur, plaie,
 * hématome, fracture…). Saisie par le médecin uniquement.
 */
export function BodyMap({ marks, onChange }: { marks: BodyMark[]; onChange: (marks: BodyMark[]) => void }) {
  const [kind, setKind] = useState<BodyMarkKind>("douleur");
  const [selected, setSelected] = useState<string | null>(null);

  const add = (view: "front" | "back", e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
    const mark: BodyMark = { id: newId(), view, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, kind, note: "" };
    onChange([...marks, mark]);
    setSelected(mark.id);
  };
  const update = (id: string, patch: Partial<BodyMark>) => onChange(marks.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Type d'annotation">
        <span className="mr-1 text-xs text-muted-foreground">Annoter :</span>
        {BODY_MARK_KINDS.map((k) => (
          <button
            key={k.code}
            type="button"
            role="radio"
            aria-checked={kind === k.code}
            onClick={() => setKind(k.code)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              kind === k.code ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            <span className="size-2.5 rounded-full" style={{ background: COLORS[k.code] }} />
            {k.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        {(["front", "back"] as const).map((view) => (
          <figure key={view} className="rounded-lg border bg-card p-2">
            <svg
              viewBox="0 0 100 220"
              className="w-full cursor-crosshair"
              role="img"
              aria-label={view === "front" ? "Schéma de face" : "Schéma de dos"}
              data-testid={`body-${view}`}
              onClick={(e) => add(view, e)}
            >
              <Silhouette />
              {marks
                .filter((m) => m.view === view)
                .map((m) => (
                  <g
                    key={m.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(m.id);
                    }}
                    className="cursor-pointer"
                  >
                    <circle cx={m.x * 100} cy={m.y * 220} r={selected === m.id ? 5 : 4} fill={COLORS[m.kind]} stroke="white" strokeWidth="1" />
                    <text x={m.x * 100} y={m.y * 220 + 1.8} textAnchor="middle" fontSize="5" fill="white" pointerEvents="none">
                      {marks.indexOf(m) + 1}
                    </text>
                  </g>
                ))}
            </svg>
            <figcaption className="text-center text-xs text-muted-foreground">{view === "front" ? "Face" : "Dos"}</figcaption>
          </figure>
        ))}
      </div>
      {marks.length > 0 && (
        <ol className="space-y-1.5">
          {marks.map((m, i) => (
            <li key={m.id} className={cn("flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm", selected === m.id && "border-primary")}>
              <span className="flex size-5 items-center justify-center rounded-full text-[11px] text-white" style={{ background: COLORS[m.kind] }}>
                {i + 1}
              </span>
              <select
                aria-label={`Type de l'annotation ${i + 1}`}
                className="h-8 rounded-md border bg-card px-2 text-sm"
                value={m.kind}
                onChange={(e) => update(m.id, { kind: e.target.value as BodyMarkKind })}
              >
                {BODY_MARK_KINDS.map((k) => (
                  <option key={k.code} value={k.code}>
                    {k.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">{m.view === "front" ? "face" : "dos"}</span>
              <Input
                aria-label={`Précision de l'annotation ${i + 1}`}
                className="h-8 min-w-40 flex-1"
                placeholder="Précision (ex. plaie 3 cm avant-bras)"
                maxLength={300}
                value={m.note}
                onChange={(e) => update(m.id, { note: e.target.value })}
              />
              <Button type="button" size="sm" variant="ghost" aria-label={`Supprimer l'annotation ${i + 1}`} onClick={() => onChange(marks.filter((x) => x.id !== m.id))}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
