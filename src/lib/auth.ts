import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string; fullName: string | null };

/**
 * Couche d'accès aux données : vérifie l'utilisateur auprès de Supabase Auth
 * (getUser valide le jeton côté serveur) et redirige vers /connexion sinon.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/connexion");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", data.user.id)
    .maybeSingle();

  return { id: data.user.id, email: data.user.email ?? "", fullName: profile?.full_name ?? null };
});
