import type { ConsultationStatus, DocumentType } from "@/types/database";
import { formatInZone } from "./time";

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

export function formatDateTime(iso: string) {
  return formatInZone(iso, { dateStyle: "medium", timeStyle: "short" });
}

export const TRANSCRIPTION_STATUS: Record<string, { label: string; variant: "secondary" | "warning" | "success" | "outline" | "destructive" }> = {
  none: { label: "Aucune", variant: "outline" },
  pending: { label: "En attente", variant: "secondary" },
  processing: { label: "En cours", variant: "warning" },
  completed: { label: "Transcrite", variant: "success" },
  failed: { label: "Échec", variant: "destructive" },
};

export const OBSERVATION_STATUS: Record<string, { label: string; variant: "secondary" | "warning" | "success" | "outline" }> = {
  none: { label: "Non commencée", variant: "outline" },
  draft: { label: "Brouillon", variant: "secondary" },
  ai_extracted: { label: "À vérifier", variant: "warning" },
  in_review: { label: "En vérification", variant: "warning" },
  validated: { label: "Validée", variant: "success" },
};

export const PRESCRIPTION_STATUS: Record<string, { label: string; variant: "secondary" | "success" | "outline" }> = {
  none: { label: "Aucune", variant: "outline" },
  draft: { label: "Brouillon", variant: "secondary" },
  validated: { label: "Validée", variant: "success" },
};
