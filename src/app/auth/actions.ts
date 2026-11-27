"use server";
import { z } from "zod";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  authenticate,
  checkPassword,
  countUsers,
  createUser,
  loginLockedUntil,
  recordLoginResult,
  setPassword,
} from "@/server/auth/accounts";
import { createSession, deleteSession, SESSION_COOKIE } from "@/server/auth/session";
import { clientForUser, sessionUser } from "@/server/db/client";
import { getDb } from "@/server/db/sqlite";
import { changePasswordSchema, firstAccountSchema, loginSchema, safeRedirectPath } from "@/lib/validation/auth";

export type FormState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Valeur renvoyée pour pré-remplir le champ après une erreur (React réinitialise le formulaire). */
  email?: string;
  fullName?: string;
};

async function openSession(userId: string) {
  const { token, expiresAt } = createSession(getDb(), userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // L'application est servie en local (http://127.0.0.1) : secure seulement si HTTPS est configuré.
    secure: process.env.AURISMED_HTTPS === "1",
    path: "/",
    expires: expiresAt,
  });
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const parsed = loginSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, email };

  const lockedUntil = loginLockedUntil(parsed.data.email);
  if (lockedUntil) {
    const minutes = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60_000));
    return { error: `Trop d'essais. Réessayez dans ${minutes} min.`, email };
  }

  const db = getDb();
  const user = await authenticate(db, parsed.data.email, parsed.data.password);
  recordLoginResult(parsed.data.email, Boolean(user));
  if (!user) return { error: "Identifiants incorrects.", email };

  await openSession(user.id);
  await clientForUser(user).from("audit_logs").insert({ user_id: user.id, action: "auth.login" });
  redirect(safeRedirectPath(formData.get("next")));
}

export async function signOut() {
  const store = await cookies();
  const user = await sessionUser();
  if (user) await clientForUser(user).from("audit_logs").insert({ user_id: user.id, action: "auth.logout" });
  deleteSession(getDb(), store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
  redirect("/connexion");
}

/** Création du premier compte, possible uniquement tant qu'aucun compte n'existe. */
export async function createFirstAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const fullName = String(formData.get("fullName") ?? "");
  const parsed = firstAccountSchema.safeParse({
    email,
    fullName,
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, email, fullName };

  const db = getDb();
  if (countUsers(db) > 0) return { error: "Un compte existe déjà : connectez-vous.", email, fullName };
  const user = await createUser(db, parsed.data);
  await openSession(user.id);
  await clientForUser(user).from("audit_logs").insert({ user_id: user.id, action: "auth.account_created" });
  redirect("/tableau-de-bord");
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await sessionUser();
  if (!user) return { error: "Session expirée. Reconnectez-vous." };
  const parsed = changePasswordSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };

  const db = getDb();
  if (!(await checkPassword(db, user.id, parsed.data.current))) {
    return { fieldErrors: { current: ["Mot de passe actuel incorrect"] } };
  }
  await setPassword(db, user.id, parsed.data.password);
  await clientForUser(user).from("audit_logs").insert({ user_id: user.id, action: "auth.password_changed" });
  // Toutes les sessions ont été fermées : on en rouvre une pour ce poste.
  await openSession(user.id);
  redirect("/tableau-de-bord");
}
