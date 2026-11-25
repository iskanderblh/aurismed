import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Une consultation est « validée » quand le médecin a validé la fiche et
 * l'ordonnance (ou indiqué qu'il n'en fait pas). Toute modification ultérieure
 * la repasse « en cours ». Une consultation archivée n'est pas touchée.
 */
export async function syncConsultationStatus(supabase: Client, consultationId: string) {
  const [{ data: c }, { data: obs }, { data: rx }] = await Promise.all([
    supabase.from("consultations").select("status").eq("id", consultationId).maybeSingle(),
    supabase.from("observation_forms").select("validation_status").eq("consultation_id", consultationId).maybeSingle(),
    supabase.from("prescriptions").select("validation_status").eq("consultation_id", consultationId).maybeSingle(),
  ]);
  if (!c || c.status === "archived") return c?.status ?? null;
  const validated = obs?.validation_status === "validated" && rx?.validation_status === "validated";
  const next = validated ? "validated" : c.status === "draft" ? "draft" : "in_progress";
  if (next !== c.status) await supabase.from("consultations").update({ status: next }).eq("id", consultationId);
  return next;
}
