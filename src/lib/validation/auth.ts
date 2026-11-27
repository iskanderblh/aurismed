import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Adresse e-mail invalide").trim().toLowerCase(),
  password: z.string().min(1, "Mot de passe requis"),
});

const newPassword = z.string().min(12, "12 caractères minimum").max(200, "200 caractères maximum");
const samePasswords = (v: { password: string; confirm: string }) => v.password === v.confirm;
const mismatch = { message: "Les mots de passe ne correspondent pas", path: ["confirm"] };

export const firstAccountSchema = z
  .object({
    email: z.email("Adresse e-mail invalide").trim().toLowerCase(),
    fullName: z.string().trim().max(200).optional(),
    password: newPassword,
    confirm: z.string(),
  })
  .refine(samePasswords, mismatch);

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Mot de passe actuel requis"),
    password: newPassword,
    confirm: z.string(),
  })
  .refine(samePasswords, mismatch);

/** N'accepte que des chemins internes pour éviter les redirections ouvertes. */
export function safeRedirectPath(value: unknown, fallback = "/tableau-de-bord"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}
