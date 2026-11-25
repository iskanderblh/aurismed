import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, FileText, Mic, Plus, Stethoscope } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/data/dashboard";
import { CONSULTATION_STATUS, DOCUMENT_TYPE, formatDateTime, patientDisplayName } from "@/lib/labels";

export const metadata: Metadata = { title: "Tableau de bord" };

function NewConsultationButton() {
  return (
    <Button asChild size="lg" className="shadow-md">
      <Link href="/consultations/nouvelle">
        <Plus /> Nouvelle consultation
      </Link>
    </Button>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Mic }) {
  return (
    <Card className="gap-0 py-5">
      <CardContent className="flex items-center gap-4">
        <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export default async function DashboardPage() {
  const [user, result] = await Promise.all([getCurrentUser(), getDashboardData()]);
  const greeting = user.fullName ? `Bonjour, ${user.fullName}` : "Bonjour";

  return (
    <div className="space-y-8">
      <PageHeader
        title={greeting}
        description="Enregistrez une téléconsultation et laissez AurisMED préparer vos documents."
        actions={<NewConsultationButton />}
      />

      {!result.ok ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Données indisponibles</AlertTitle>
          <AlertDescription>
            {result.error} Vérifiez la configuration Supabase et que la migration a bien été appliquée, puis
            rechargez la page.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard label="Consultations" value={result.data.totalConsultations} icon={Stethoscope} />
            <StatCard label="Documents générés" value={result.data.totalDocuments} icon={FileText} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Consultations récentes</CardTitle>
                <Button asChild variant="link" size="sm" className="h-auto p-0">
                  <Link href="/consultations">Tout voir</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {result.data.recentConsultations.length === 0 ? (
                  <EmptyState>Aucune consultation pour le moment.</EmptyState>
                ) : (
                  <ul className="divide-y">
                    {result.data.recentConsultations.map((c) => {
                      const status = CONSULTATION_STATUS[c.status];
                      return (
                        <li key={c.id}>
                          <Link
                            href={`/consultations/${c.id}`}
                            className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{patientDisplayName(c)}</p>
                              <p className="text-xs text-muted-foreground">{formatDateTime(c.consultation_date)}</p>
                            </div>
                            <Badge variant={status.variant}>{status.label}</Badge>
                            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Documents récents</CardTitle>
                <Button asChild variant="link" size="sm" className="h-auto p-0">
                  <Link href="/documents">Tout voir</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {result.data.recentDocuments.length === 0 ? (
                  <EmptyState>Aucun document généré pour le moment.</EmptyState>
                ) : (
                  <ul className="divide-y">
                    {result.data.recentDocuments.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 py-3">
                        <FileText className="size-4 text-sky-600" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{DOCUMENT_TYPE[d.document_type]}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {d.consultations ? patientDisplayName(d.consultations) : "—"} · {formatDateTime(d.created_at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
