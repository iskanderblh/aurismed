/**
 * Lecture centralisée des variables d'environnement.
 * Seules les variables préfixées NEXT_PUBLIC_ sont exposées au navigateur.
 * Les secrets (clés OpenAI, clé service Supabase) ne sont lus que côté serveur.
 */

export type SupabasePublicEnv = { url: string; publishableKey: string };

export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function requireSupabasePublicEnv(): SupabasePublicEnv {
  const env = getSupabasePublicEnv();
  if (!env) {
    throw new Error(
      "Configuration Supabase manquante : définissez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY dans .env.local",
    );
  }
  return env;
}

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** État de configuration affiché dans l'application (aucune valeur secrète n'est renvoyée). */
export function getConfigurationStatus() {
  return {
    supabase: getSupabasePublicEnv() !== null,
    openai: Boolean(process.env.OPENAI_API_KEY),
  };
}
