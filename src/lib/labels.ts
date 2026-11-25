import type { ConsultationStatus, DocumentType } from "@/types/database";

export const CONSULTATION_STATUS: Record<ConsultationStatus, { label: string; variant: "secondary" | "warning" | "success" | "outline" }> = {
  draft: { label: "Brouillon", variant: "outline" },
  in_progress: { label: "En cours", variant: "warning" },
  validated: { label: "Validée", variant: "success" },
  archived: { label: "Archivée", variant: "secondary" },
};

export const DOCUMENT_TYPE: Record<DocumentType, string> = {
  observation: "Fiche d'observation",
  prescription: "Ordonnance",
};

export function patientDisplayName(c: { patient_name: string | null; patient_first_name: string | null }) {
  const name = [c.patient_name?.toUpperCase(), c.patient_first_name].filter(Boolean).join(" ");
  return name || "Patient non renseigné";
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
export function formatDateTime(iso: string) {
  return dateFormatter.format(new Date(iso));
}
