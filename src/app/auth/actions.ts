"use server";
import { z } from "zod";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import {
  loginSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
  safeRedirectPath,
} from "@/lib/validation/auth";

export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Valeur renvoyée pour pré-remplir le champ après une erreur (React réinitialise le formulaire). */
  email?: string;
};

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const parsed = loginSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.status === 400 || error.code === "invalid_credentials") {
      return { error: "Identifiants incorrects.", email };
    }
    return { error: "Connexion impossible pour le moment. Vérifiez votre réseau puis réessayez.", email };
  }

  await supabase.from("audit_logs").insert({ user_id: data.user.id, action: "auth.login" });
  redirect(safeRedirectPath(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) await supabase.from("audit_logs").insert({ user_id: data.user.id, action: "auth.logout" });
  await supabase.auth.signOut();
  redirect("/connexion");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const parsed = passwordResetRequestSchema.safeParse({ email });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getSiteUrl()}/auth/confirm?next=/reinitialiser-mot-de-passe`,
  });
  if (error && error.status !== 400) {
    return { error: "L'envoi de l'e-mail a échoué. Réessayez dans quelques minutes.", email };
  }
  // Même message que le compte existe ou non, pour ne pas révéler les adresses enregistrées.
  return { success: "Si un compte correspond à cette adresse, un lien de réinitialisation vient d'être envoyé." };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Le mot de passe n'a pas pu être modifié. Le lien a peut-être expiré." };

  await supabase.from("audit_logs").insert({ user_id: data.user.id, action: "auth.password_changed" });
  redirect("/tableau-de-bord");
}
