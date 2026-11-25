import type { Metadata } from "next";
import { History } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { UpcomingFeature } from "@/components/layout/upcoming-feature";

export const metadata: Metadata = { title: "Historique des consultations" };

export default function ConsultationHistoryPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Historique des consultations" description="Retrouvez et reprenez vos consultations." />
      <UpcomingFeature
        icon={History}
        phase={2}
        title="Historique et recherche"
        points={[
          "Recherche par patient",
          "Statuts de consultation, de transcription, de fiche et d'ordonnance",
          "Reprise d'une consultation non terminée",
        ]}
      />
    </div>
  );
}
