import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { ConsultationWorkspace } from "@/components/consultation/consultation-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { rowToDraft } from "@/lib/consultation/mapping";
import { getConsultation } from "@/lib/data/consultations";
import { getObservationStageData, getRecordingStageData, purgeExpiredAudio } from "@/lib/data/recordings";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CONSULTATION_STATUS, formatDateTime, patientDisplayName } from "@/lib/labels";

export const metadata: Metadata = { title: "Consultation" };

export default async function ConsultationPage({ params }: PageProps<"/consultations/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  // Applique la politique de conservation de l'audio avant d'afficher les segments.
  await purgeExpiredAudio(await createClient()).catch((e) => console.error("[rétention]", e));
  const result = await getConsultation(id);

  if (!result.ok) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Consultation indisponible</AlertTitle>
        <AlertDescription>{result.error} Rechargez la page dans quelques instants.</AlertDescription>
      </Alert>
    );
  }
  const consultation = result.data;
  if (!consultation) notFound();

  const [recordingData, observationData] = await Promise.all([
    getRecordingStageData(user.id, consultation),
    getObservationStageData(consultation.id),
  ]);
  const status = CONSULTATION_STATUS[consultation.status];
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/consultations">
          <ArrowLeft /> Historique
        </Link>
      </Button>
      <PageHeader
        title={patientDisplayName(consultation)}
        description={`Consultation du ${formatDateTime(consultation.consultation_date)}`}
        actions={<Badge variant={status.variant}>{status.label}</Badge>}
      />
      <ConsultationWorkspace
        key={consultation.id}
        initialId={consultation.id}
        initialDraft={rowToDraft(consultation)}
        lastSavedAt={consultation.updated_at}
        recordingData={recordingData}
        observationData={observationData}
      />
    </div>
  );
}
