import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabasePublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/** Client Supabase côté serveur, lié à la session de l'utilisateur (RLS appliquée). */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = requireSupabasePublicEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis un Server Component : le proxy se charge de rafraîchir la session.
        }
      },
    },
  });
}
