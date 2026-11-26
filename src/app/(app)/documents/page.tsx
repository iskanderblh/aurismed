import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Download, ExternalLink, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listDocuments } from "@/lib/data/documents";
import { DOCUMENT_TYPE, formatDateTime } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { DocumentType } from "@/types/database";

export const metadata: Metadata = { title: "Documents" };

const FILTERS: { key: string; label: string; type?: DocumentType }[] = [
  { key: "", label: "Tous" },
  { key: "observation", label: "Fiches d'observation", type: "observation" },
  { key: "prescription", label: "Ordonnances", type: "prescription" },
];

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.type) ?? FILTERS[0];
  const all = params.versions === "1";
  const result = await listDocuments({ type: filter.type });
  const docs = result.ok ? result.data.filter((d) => all || d.latest) : [];
  const href = (type: string, versions: boolean) => {
    const q = new URLSearchParams();
    if (type) q.set("type", type);
    if (versions) q.set("versions", "1");
    const s = q.toString();
    return s ? `/documents?${s}` : "/documents";
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Documents" description="Fiches d'observation et ordonnances générées à partir des données validées." />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={href(f.key, all)}
            aria-current={f.key === filter.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              f.key === filter.key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {f.label}
          </Link>
        ))}
        <Link href={href(filter.key, !all)} className="ml-auto text-sm text-primary underline">
          {all ? "Dernières versions uniquement" : "Afficher toutes les versions"}
        </Link>
      </div>

      {!result.ok ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Documents indisponibles</AlertTitle>
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : docs.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <FileText className="size-8 text-muted-foreground" />
          <p className="font-medium">Aucun document</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Les PDF se génèrent depuis une consultation, une fois la fiche d&apos;observation ou l&apos;ordonnance validée.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y" data-testid="documents-list">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <FileText className="size-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {DOCUMENT_TYPE[d.type]}
                    <Badge variant={d.latest ? "secondary" : "outline"}>v{d.version}</Badge>
                    {!d.latest && <span className="text-xs text-muted-foreground">version antérieure</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    <Link href={`/consultations/${d.consultationId}`} className="hover:underline">
                      {d.patient}
                    </Link>
                    {d.consultationDate ? ` · consultation du ${formatDateTime(d.consultationDate)}` : ""} · généré le {formatDateTime(d.createdAt)}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener">
                      <ExternalLink /> Ouvrir
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <a href={`/api/documents/${d.id}?download=1`} aria-label={`Télécharger ${DOCUMENT_TYPE[d.type]} v${d.version}`}>
                      <Download />
                    </a>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
