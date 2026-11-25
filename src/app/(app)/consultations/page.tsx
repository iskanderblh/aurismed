import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listConsultations } from "@/lib/data/consultations";
import {
  CONSULTATION_STATUS,
  OBSERVATION_STATUS,
  PRESCRIPTION_STATUS,
  TRANSCRIPTION_STATUS,
  formatDateTime,
  patientDisplayName,
} from "@/lib/labels";
import { SearchBox } from "./search-box";

export const metadata: Metadata = { title: "Historique des consultations" };

export default async function ConsultationHistoryPage({ searchParams }: PageProps<"/consultations">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const result = await listConsultations(q);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historique des consultations"
        description="Retrouvez, reprenez ou complétez vos consultations."
        actions={
          <Button asChild>
            <Link href="/consultations/nouvelle">
              <Plus /> Nouvelle consultation
            </Link>
          </Button>
        }
      />

      {params.supprimee === "1" && (
        <Alert variant="info">
          <CheckCircle2 />
          <AlertDescription>La consultation et ses fichiers ont été supprimés.</AlertDescription>
        </Alert>
      )}

      <Suspense>
        <SearchBox />
      </Suspense>

      {!result.ok ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Historique indisponible</AlertTitle>
          <AlertDescription>{result.error} Rechargez la page pour réessayer.</AlertDescription>
        </Alert>
      ) : result.data.length === 0 ? (
        <Card className="items-center py-16 text-center text-sm text-muted-foreground">
          {q ? `Aucune consultation ne correspond à « ${q} ».` : "Aucune consultation pour le moment."}
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="hidden grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_1.5rem] gap-4 border-b bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground lg:grid">
            <span>Patient</span>
            <span>Consultation</span>
            <span>Transcription</span>
            <span>Fiche d&apos;observation</span>
            <span>Ordonnance</span>
            <span />
          </div>
          <ul className="divide-y">
            {result.data.map((c) => {
              const s = CONSULTATION_STATUS[c.status];
              const t = TRANSCRIPTION_STATUS[c.transcription];
              const o = OBSERVATION_STATUS[c.observation];
              const r = PRESCRIPTION_STATUS[c.prescription];
              return (
                <li key={c.id}>
                  <Link
                    href={`/consultations/${c.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-muted/50 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_1.5rem]"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{patientDisplayName(c)}</p>
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        {formatDateTime(c.consultation_date)}
                        {c.documents > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <FileText className="size-3" /> {c.documents} PDF
                          </span>
                        )}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground lg:order-last" aria-hidden />
                    <div className="col-span-2 flex flex-wrap gap-2 lg:contents">
                      <span><Badge variant={s.variant}>{s.label}</Badge></span>
                      <span><Badge variant={t.variant}><span className="lg:hidden">Transcription : </span>{t.label}</Badge></span>
                      <span><Badge variant={o.variant}><span className="lg:hidden">Fiche : </span>{o.label}</Badge></span>
                      <span><Badge variant={r.variant}><span className="lg:hidden">Ordonnance : </span>{r.label}</Badge></span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {result.ok && result.data.length === 100 && (
        <p className="text-center text-xs text-muted-foreground">
          Les 100 consultations les plus récentes sont affichées. Affinez la recherche pour en trouver d&apos;autres.
        </p>
      )}
    </div>
  );
}
