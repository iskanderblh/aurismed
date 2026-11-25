import type { Metadata } from "next";
import { Mic } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { UpcomingFeature } from "@/components/layout/upcoming-feature";

export const metadata: Metadata = { title: "Nouvelle consultation" };

export default function NewConsultationPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Nouvelle consultation"
        description="Patient, enregistrement, transcription, extraction IA, vérification, ordonnance, PDF."
      />
      <UpcomingFeature
        icon={Mic}
        phase={2}
        title="Parcours de consultation guidé"
        points={[
          "Informations patient et navire (fiche d'observation, page 1)",
          "Création de la consultation et sauvegarde automatique du brouillon",
          "Enregistrement vocal et transcription en phase 3, extraction IA en phase 4",
        ]}
      />
    </div>
  );
}
