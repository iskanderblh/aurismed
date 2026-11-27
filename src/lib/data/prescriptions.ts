import "server-only";
import { createClient } from "@/server/db/client";
import { prescriptionSchema, type PrescriptionData } from "@/lib/prescription/schema";
import type { SettingsValues } from "@/lib/validation/settings";
import { getSettings } from "./settings";

export type Prescriber = Omit<SettingsValues, "audioRetentionDays">;

export type PrescriptionStageData = {
  data: PrescriptionData | null;
  validationStatus: "draft" | "validated" | null;
  validatedAt: string | null;
  prescriber: Prescriber;
};

const EMPTY_PRESCRIBER: Prescriber = {
  fullName: "", specialty: "", rpps: "", phone: "", institutionName: "", institutionAddress: "", institutionPhone: "",
};

export async function getPrescriptionStageData(userId: string, consultationId: string | null): Promise<PrescriptionStageData> {
  const settings = await getSettings(userId);
  const prescriber: Prescriber = settings.ok
    ? {
        fullName: settings.data.fullName,
        specialty: settings.data.specialty,
        rpps: settings.data.rpps,
        phone: settings.data.phone,
        institutionName: settings.data.institutionName,
        institutionAddress: settings.data.institutionAddress,
        institutionPhone: settings.data.institutionPhone,
      }
    : EMPTY_PRESCRIBER;
  if (!consultationId) return { data: null, validationStatus: null, validatedAt: null, prescriber };
  const db = await createClient();
  const { data } = await db
    .from("prescriptions")
    .select("prescription_data, validation_status, validated_at")
    .eq("consultation_id", consultationId)
    .maybeSingle();
  if (!data) return { data: null, validationStatus: null, validatedAt: null, prescriber };
  const parsed = prescriptionSchema.safeParse(data.prescription_data);
  return {
    data: parsed.success ? parsed.data : null,
    validationStatus: data.validation_status,
    validatedAt: data.validated_at,
    prescriber,
  };
}
