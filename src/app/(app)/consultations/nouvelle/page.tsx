import type { Metadata } from "next";
import { ConsultationWorkspace } from "@/components/consultation/consultation-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { emptyDraft } from "@/lib/consultation/schema";
import { getCurrentUser } from "@/lib/auth";
import { getRecordingStageData } from "@/lib/data/recordings";

export const metadata: Metadata = { title: "Nouvelle consultation" };

export default async function NewConsultationPage() {
  const user = await getCurrentUser();
  const recordingData = await getRecordingStageData(user.id, null);
  const draft = emptyDraft();
  // Date et heure d'appel pré-remplies côté client (fuseau du médecin) : laissées vides ici.
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nouvelle consultation"
        description="Le brouillon est créé et enregistré automatiquement dès la première saisie."
      />
      <ConsultationWorkspace initialId={null} initialDraft={draft} recordingData={recordingData} />
    </div>
  );
}
