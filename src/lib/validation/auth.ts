import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Adresse e-mail invalide").trim().toLowerCase(),
  password: z.string().min(1, "Mot de passe requis"),
});

export const passwordResetRequestSchema = z.object({
  email: z.email("Adresse e-mail invalide").trim().toLowerCase(),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(12, "12 caractères minimum"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Les mots de passe ne correspondent pas", path: ["confirm"] });

/** N'accepte que des chemins internes pour éviter les redirections ouvertes. */
export function safeRedirectPath(value: unknown, fallback = "/tableau-de-bord"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  return value;
}
