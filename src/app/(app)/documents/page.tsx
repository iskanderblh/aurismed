import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { UpcomingFeature } from "@/components/layout/upcoming-feature";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Documents" description="Fiches d'observation et ordonnances générées." />
      <UpcomingFeature
        icon={FileText}
        phase={6}
        title="Documents PDF"
        points={[
          "Fiche d'observation médicale (structure de la fiche de référence)",
          "Ordonnance médicale",
          "Aperçu, téléchargement sécurisé et impression",
        ]}
      />
    </div>
  );
}
