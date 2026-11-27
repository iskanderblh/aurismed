import "server-only";
import { createClient } from "@/server/db/client";
import type { Json } from "@/types/database";
import type { SettingsValues } from "@/lib/validation/settings";
import type { Result } from "./dashboard";

const obj = (v: Json | undefined): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function getSettings(userId: string): Promise<Result<SettingsValues>> {
  const db = await createClient();
  const [profile, settings] = await Promise.all([
    db.from("profiles").select("full_name, professional_info").eq("id", userId).maybeSingle(),
    db.from("user_settings").select("audio_retention_days, institution_info").eq("user_id", userId).maybeSingle(),
  ]);
  if (profile.error || settings.error) {
    console.error("[paramètres] lecture", profile.error?.message ?? settings.error?.message);
    return { ok: false, error: "Impossible de charger les paramètres." };
  }
  const pro = obj(profile.data?.professional_info);
  const inst = obj(settings.data?.institution_info);
  return {
    ok: true,
    data: {
      fullName: profile.data?.full_name ?? "",
      specialty: str(pro.specialty),
      rpps: str(pro.rpps),
      phone: str(pro.phone),
      institutionName: str(inst.name),
      institutionAddress: str(inst.address),
      institutionPhone: str(inst.phone),
      audioRetentionDays: settings.data?.audio_retention_days ?? 30,
    },
  };
}
