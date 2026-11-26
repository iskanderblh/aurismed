"use client";

import { useState } from "react";
import { AlertCircle, Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DocumentInfo } from "@/lib/data/documents";
import { DOCUMENT_TYPE } from "@/lib/labels";
import type { DocumentType } from "@/types/database";
import { formatInZone } from "@/lib/time";

const fmt = (iso: string) => formatInZone(iso, { dateStyle: "short", timeStyle: "short" });

/**
 * Génération des PDF depuis la consultation. Seules les données validées par le
 * médecin sont imprimées ; chaque génération crée une nouvelle version.
 */
export function DocumentsPanel({
  consultationId,
  initial,
  observation,
  prescription,
  onGenerated,
}: {
  consultationId: string | null;
  initial: DocumentInfo[];
  observation: { validated: boolean; validatedAt: string | null };
  prescription: { validated: boolean; validatedAt: string | null; printable: boolean; none: boolean };
  onGenerated?: () => void;
}) {
  const [docs, setDocs] = useState(initial);
  const [busy, setBusy] = useState<DocumentType | null>(null);
  const [error, setError] = useState<string>();

  const generate = async (type: DocumentType) => {
    if (!consultationId) return;
    setBusy(type);
    setError(undefined);
    try {
      const res = await fetch(`/api/consultations/${consultationId}/documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok: true; document: { id: string; type: DocumentType; version: number; createdAt: string } }
        | { ok: false; error: string }
        | null;
      if (!body?.ok) {
        setError(body?.error ?? "La génération du PDF a échoué.");
        return;
      }
      const d = body.document;
      setDocs((list) => [
        { id: d.id, type: d.type, version: d.version, createdAt: d.createdAt, consultationId, patient: "", consultationDate: null, latest: true },
        ...list.map((x) => (x.type === d.type ? { ...x, latest: false } : x)),
      ]);
      onGenerated?.();
    } catch {
      setError("Connexion au serveur impossible. Réessayez.");
    } finally {
      setBusy(null);
    }
  };

  const latest = (type: DocumentType) => docs.find((d) => d.type === type && d.latest);
  const stale = (type: DocumentType, validatedAt: string | null) => {
    const l = latest(type);
    return Boolean(l && validatedAt && new Date(validatedAt) > new Date(l.createdAt));
  };

  const cards: { type: DocumentType; ready: boolean; hint: string; validatedAt: string | null }[] = [
    {
      type: "observation",
      ready: observation.validated,
      hint: observation.validated ? "Fiche validée." : "Validez d'abord la fiche d'observation.",
      validatedAt: observation.validatedAt,
    },
    {
      type: "prescription",
      ready: prescription.validated && prescription.printable,
      hint: !prescription.validated
        ? "Validez d'abord l'ordonnance."
        : prescription.none
          ? "Aucun médicament prescrit : pas d'ordonnance à imprimer."
          : "Ordonnance validée.",
      validatedAt: prescription.validatedAt,
    },
  ];

  if (!consultationId) return <p className="text-sm text-muted-foreground">Les documents seront disponibles une fois la consultation créée.</p>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => {
          const l = latest(c.type);
          return (
            <div key={c.type} className="space-y-3 rounded-lg border p-4" data-document={c.type}>
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <span className="font-medium">{DOCUMENT_TYPE[c.type]}</span>
                {l && <Badge variant="secondary">v{l.version}</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{c.hint}</p>
              {stale(c.type, c.validatedAt) && (
                <p className="text-sm text-warning">Validée à nouveau depuis le dernier PDF : générez une nouvelle version.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!c.ready || busy !== null} onClick={() => void generate(c.type)}>
                  {busy === c.type ? <Loader2 className="animate-spin" /> : <FileText />}
                  {l ? "Générer une nouvelle version" : "Générer le PDF"}
                </Button>
                {l && (
                  <>
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/documents/${l.id}`} target="_blank" rel="noopener">
                        <ExternalLink /> Ouvrir
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <a href={`/api/documents/${l.id}?download=1`}>
                        <Download /> Télécharger
                      </a>
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {error && (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="size-4" /> {error}
        </p>
      )}
      {docs.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Historique des versions ({docs.length})</summary>
          <ul className="mt-2 divide-y rounded-lg border">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  {DOCUMENT_TYPE[d.type]} · v{d.version} · {fmt(d.createdAt)}
                </span>
                <a className="text-primary underline" href={`/api/documents/${d.id}`} target="_blank" rel="noopener">
                  Ouvrir
                </a>
                <a className="text-primary underline" href={`/api/documents/${d.id}?download=1`}>
                  Télécharger
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
