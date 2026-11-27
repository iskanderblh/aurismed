import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { clientForUser, sessionUser } from "@/server/db/client";

export type CurrentUser = { id: string; email: string; fullName: string | null };

/**
 * Couche d'accès aux données : vérifie la session locale (jeton en base) et
 * redirige vers /connexion sinon.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser> => {
  const user = await sessionUser();
  if (!user) redirect("/connexion");

  const { data: profile } = await clientForUser(user)
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return { id: user.id, email: user.email, fullName: profile?.full_name ?? null };
});
