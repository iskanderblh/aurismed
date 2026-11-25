"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { settingsSchema } from "@/lib/validation/settings";

export type SettingsState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Saisie renvoyée après une erreur, pour ne pas la perdre à la réinitialisation du formulaire. */
  values?: Record<string, string>;
};

export async function updateSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const raw = Object.fromEntries([...formData.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Certains champs sont invalides.", fieldErrors: z.flattenError(parsed.error).fieldErrors, values: raw };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Session expirée. Reconnectez-vous.", values: raw };

  const v = parsed.data;
  const [profile, settings] = await Promise.all([
    supabase
      .from("profiles")
      .update({ full_name: v.fullName || null, professional_info: { specialty: v.specialty, rpps: v.rpps, phone: v.phone } })
      .eq("id", auth.user.id),
    supabase
      .from("user_settings")
      .update({
        audio_retention_days: v.audioRetentionDays,
        institution_info: { name: v.institutionName, address: v.institutionAddress, phone: v.institutionPhone },
      })
      .eq("user_id", auth.user.id),
  ]);
  if (profile.error || settings.error) {
    console.error("[paramètres] sauvegarde", profile.error?.message ?? settings.error?.message);
    return { error: "L'enregistrement a échoué. Réessayez.", values: raw };
  }
  await supabase.from("audit_logs").insert({ user_id: auth.user.id, action: "settings.updated" });
  revalidatePath("/", "layout");
  return { ok: true };
}
