"use client";

import { useState, useTransition } from "react";
import { BookOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORIES, SYMPTOM_BY_ID, buildTaxonomy, searchSymptoms, type CategoryKey, type CustomTerm } from "@/lib/urology/taxonomy";
import { addUrologySynonyms, addUrologyTerm, removeUrologyTerm } from "./urology-actions";

const split = (v: string) =>
  v
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Taxonomie urologique du médecin : termes et synonymes (expressions des
 * patients) ajoutés à la base intégrée. Ils servent à la recherche dans la
 * fiche et sont transmis au modèle local pour reconnaître ces expressions.
 */
export function UrologyTerms({ custom }: { custom: CustomTerm[] }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CategoryKey>("custom");
  const [synonyms, setSynonyms] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const taxonomy = buildTaxonomy(custom);
  const results = target ? [] : searchSymptoms(query, taxonomy).slice(0, 8);

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string, reset: () => void) =>
    start(async () => {
      const r = await fn().catch(() => ({ ok: false as const, error: "Connexion au serveur impossible." }));
      if (r.ok) {
        reset();
        setNotice({ kind: "ok", text: ok });
      } else setNotice({ kind: "error", text: r.error });
    });

  return (
    <Card id="taxonomie-urologique">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="size-5" /> Taxonomie urologique
        </CardTitle>
        <CardDescription>
          {taxonomy.length - custom.filter((c) => !SYMPTOM_BY_ID.has(c.code)).length} termes intégrés. Ajoutez vos termes et les expressions de vos patients :
          elles aident l&apos;analyse locale à reconnaître un symptôme. Rien n&apos;est envoyé en ligne.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {notice && (
          <p role="status" className={notice.kind === "ok" ? "text-sm text-success" : "text-sm text-destructive"}>
            {notice.text}
          </p>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Ajouter des synonymes à un terme existant</h3>
          {target ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-60 flex-1 space-y-1">
                <Label htmlFor="uro-extra">Synonymes pour « {taxonomy.find((t) => t.id === target)?.name} » (séparés par des virgules)</Label>
                <Input id="uro-extra" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="ex. ça me pique quand je fais pipi" />
              </div>
              <Button variant="ghost" onClick={() => setTarget(null)}>
                Annuler
              </Button>
              <Button
                disabled={pending || !split(extra).length}
                onClick={() =>
                  run(() => addUrologySynonyms(target, split(extra)), "Synonymes ajoutés.", () => {
                    setTarget(null);
                    setExtra("");
                    setQuery("");
                  })
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <Plus />} Ajouter
              </Button>
            </div>
          ) : (
            <>
              <Input aria-label="Rechercher un terme" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un terme (ex. brûlures)" />
              {results.length > 0 && (
                <ul className="divide-y rounded-md border">
                  {results.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{r.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.synonyms.join(", ")}</span>
                      </span>
                      <Button size="sm" variant="outline" onClick={() => setTarget(r.id)}>
                        Ajouter des synonymes
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">Nouveau terme</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="uro-name">Nom</Label>
              <Input id="uro-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="uro-cat">Catégorie</Label>
              <select
                id="uro-cat"
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoryKey)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="uro-syn">Synonymes et expressions des patients (séparés par des virgules)</Label>
              <Input id="uro-syn" value={synonyms} onChange={(e) => setSynonyms(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="uro-desc">Description (facultatif)</Label>
              <Input id="uro-desc" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <Button
            disabled={pending || name.trim().length < 2}
            onClick={() =>
              run(() => addUrologyTerm({ name, category, synonyms: split(synonyms), description }), "Terme ajouté.", () => {
                setName("");
                setSynonyms("");
                setDescription("");
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} Ajouter le terme
          </Button>
        </section>

        {custom.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Vos ajouts</h3>
            <ul className="divide-y rounded-md border" data-testid="custom-terms">
              {custom.map((c) => {
                const builtin = SYMPTOM_BY_ID.get(c.code);
                return (
                  <li key={c.code} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{builtin?.name ?? c.name}</span>{" "}
                      <Badge variant="outline">{builtin ? "synonymes ajoutés" : CATEGORIES.find((x) => x.key === c.category)?.title}</Badge>
                      <span className="block text-xs text-muted-foreground">{c.synonyms.join(", ") || "aucun synonyme"}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      aria-label={`Retirer ${c.name}`}
                      onClick={() => run(() => removeUrologyTerm(c.code), builtin ? "Synonymes retirés." : "Terme retiré.", () => {})}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
