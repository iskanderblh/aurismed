"use client";

import { Check, Plus, Quote, Trash2, Undo2, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MedicationLine } from "@/lib/medical/form-state";
import { cn } from "@/lib/utils";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `m-${Date.now()}-${Math.random()}`);

/**
 * Médicaments évoqués explicitement pendant la consultation. L'IA ne fait que
 * proposer : chaque ligne doit être acceptée, corrigée ou rejetée par le médecin.
 * Aucune posologie n'est déduite (champ vide si non dite).
 */
export function MedicationsEditor({ items, onChange }: { items: MedicationLine[]; onChange: (items: MedicationLine[]) => void }) {
  const update = (id: string, patch: Partial<MedicationLine>) => onChange(items.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-muted-foreground">Aucun médicament mentionné.</p>}
      {items.map((m) => (
        <MedicationRow key={m.id} item={m} onUpdate={(p) => update(m.id, p)} onRemove={() => onChange(items.filter((x) => x.id !== m.id))} />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...items, { id: newId(), name: "", dosage: "", posology: "", durationDays: null, indication: "", origin: "manual", status: "accepted" }])
        }
      >
        <Plus /> Ajouter un médicament
      </Button>
    </div>
  );
}

function MedicationRow({ item, onUpdate, onRemove }: { item: MedicationLine; onUpdate: (p: Partial<MedicationLine>) => void; onRemove: () => void }) {
  const [showSource, setShowSource] = useState(false);
  const proposed = item.status === "proposed";
  const rejected = item.status === "rejected";
  // Une modification d'une proposition vaut prise en charge par le médecin.
  const edit = (p: Partial<MedicationLine>) => onUpdate(proposed ? { ...p, status: "accepted" } : p);

  return (
    <div
      data-medication={item.id}
      className={cn("rounded-lg border p-3", proposed && "border-amber-300 bg-amber-50/60", rejected && "opacity-60")}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant={proposed ? "warning" : rejected ? "outline" : item.origin === "ai" ? "success" : "secondary"}>
          {proposed ? "Proposé par l'IA, à vérifier" : rejected ? "Rejeté" : item.origin === "ai" ? "Accepté" : "Saisi par le médecin"}
        </Badge>
        <div className="ml-auto flex flex-wrap gap-1">
          {proposed && (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => onUpdate({ status: "accepted" })} disabled={!item.name.trim()}>
                <Check /> Accepter
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onUpdate({ status: "rejected" })}>
                <X /> Rejeter
              </Button>
            </>
          )}
          {rejected && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onUpdate({ status: "proposed" })}>
              <Undo2 /> Rétablir
            </Button>
          )}
          {item.source && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowSource((s) => !s)}>
              <Quote /> Source
            </Button>
          )}
          {item.origin === "manual" && (
            <Button type="button" size="sm" variant="ghost" onClick={onRemove} aria-label="Retirer ce médicament">
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Labeled label="Médicament">
          <Input value={item.name} disabled={rejected} maxLength={200} onChange={(e) => edit({ name: e.target.value })} />
        </Labeled>
        <Labeled label="Dosage">
          <Input value={item.dosage} disabled={rejected} maxLength={200} placeholder="Non précisé" onChange={(e) => edit({ dosage: e.target.value })} />
        </Labeled>
        <Labeled label="Posologie">
          <Input value={item.posology} disabled={rejected} maxLength={500} placeholder="Non précisée" onChange={(e) => edit({ posology: e.target.value })} />
        </Labeled>
        <Labeled label="Durée (jours)">
          <Input
            inputMode="numeric"
            disabled={rejected}
            value={item.durationDays ?? ""}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              edit({ durationDays: v ? Number(v) : null });
            }}
          />
        </Labeled>
        <Labeled label="Indication">
          <Input value={item.indication} disabled={rejected} maxLength={300} onChange={(e) => edit({ indication: e.target.value })} />
        </Labeled>
      </div>
      {item.notes?.length ? (
        <ul className="mt-2 text-xs text-warning">
          {item.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      {showSource && item.source && <blockquote className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">« {item.source} »</blockquote>}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
